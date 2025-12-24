#!/usr/bin/env python3

"""Train Amy's gesture MLP from bundle manifests.

The script looks at the training bundle manifest produced by the app uploads,
converts each bundle into a training sample, trains a simple MLP, and writes
updated weight files for the global as well as per-profile models. A structured
training report is printed to stdout so callers (the Express server) can relay
status back to the app.
"""

import argparse
import hashlib
import json
import logging
import math
import os
import sys
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Union

import numpy as np

# Add scripts directory to path for shared utils
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "scripts")))
from ml_shared_utils import filter_by_profile_logic

LOGGER = logging.getLogger("amyserver.train_mlp")
if not LOGGER.handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    LOGGER.addHandler(handler)
LOGGER.setLevel(logging.INFO)
LOGGER.propagate = False

try:  # Optional heavy dependencies – we degrade gracefully when absent
    import cv2  # type: ignore
    import mediapipe as mp  # type: ignore
    try:
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision as mp_vision
    except (ImportError, AttributeError):
        mp_tasks = None
        mp_vision = None
except Exception:  # pragma: no cover - mediapipe not always available in CI
    cv2 = None
    mp = None
    mp_tasks = None
    mp_vision = None


class DependencyUnavailableError(RuntimeError):
    """Raised when optional training dependencies are missing but required."""


def _require_hand_landmark_dependencies(context: str) -> None:
    if cv2 is not None and mp is not None:
        return
    message = (
        "mediapipe/opencv required for landmark extraction but unavailable. "
        "Install 'mediapipe' and 'opencv-python' before processing "
        f"{context}."
    )
    if DEPENDENCIES_REQUIRED:
        raise DependencyUnavailableError(message)
    print(message, file=sys.stderr)

# --- Config -----------------------------------------------------------------

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DATA_DIR = Path(os.environ.get("MLP_DATA_DIR", DEFAULT_DATA_DIR))
MANIFEST_PATH = Path(
    os.environ.get(
        "MLP_MANIFEST_PATH",
        DATA_DIR / "datasets" / "training_manifest.json",
    )
)
MODELS_DIR = Path(os.environ.get("MLP_MODELS_DIR", DATA_DIR / "models"))
GLOBAL_MODEL_PATH = MODELS_DIR / "global" / "amy_model.npz"
CACHE_FILENAME = "landmarks_cached.json"
LEGACY_DATASET_PATH = Path(
    os.environ.get("MLP_DATASET_PATH", DATA_DIR / "dgs_samples.json")
)

VIDEO_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".m4v",
    ".webm",
    ".avi",
    ".mkv",
}

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
}

HIDDEN_SIZE = int(os.environ.get("MLP_HIDDEN_SIZE", "128"))
LEARNING_RATE = float(os.environ.get("MLP_LEARNING_RATE", "0.01"))
EPOCHS = int(os.environ.get("MLP_EPOCHS", "500"))
MAX_FRAMES_PER_CLIP = int(os.environ.get("MLP_MAX_FRAMES", "120"))
FRAME_STRIDE = int(os.environ.get("MLP_FRAME_STRIDE", "2"))
DROPOUT_RATE = max(0.0, min(1.0, float(os.environ.get("MLP_DROPOUT_RATE", "0.0"))))
VALIDATION_FRACTION = float(os.environ.get("MLP_VALIDATION_FRACTION", "0.15"))
AUGMENTATIONS_PER_SAMPLE = max(0, int(os.environ.get("MLP_AUGMENTATIONS_PER_SAMPLE", "0")))
CLASS_WEIGHT_SMOOTHING = max(0.0, float(os.environ.get("MLP_CLASS_WEIGHT_SMOOTHING", "0.0")))
_ENV_PATIENCE = os.environ.get("MLP_EARLY_STOPPING_PATIENCE")
EARLY_STOPPING_PATIENCE: Optional[int] = None
if _ENV_PATIENCE:
    try:
        parsed = int(_ENV_PATIENCE)
        if parsed > 0:
            EARLY_STOPPING_PATIENCE = parsed
        else:
            LOGGER.warning(
                "MLP_EARLY_STOPPING_PATIENCE must be > 0, got '%s'. Disabling.",
                _ENV_PATIENCE,
            )
    except ValueError:
        LOGGER.warning(
            "MLP_EARLY_STOPPING_PATIENCE is not a valid integer: '%s'. Disabling.",
            _ENV_PATIENCE,
        )

_env_min_delta_str = os.environ.get("MLP_EARLY_STOPPING_MIN_DELTA", "0.0")
try:
    _parsed_min_delta = float(_env_min_delta_str)
except ValueError:
    LOGGER.warning(
        "MLP_EARLY_STOPPING_MIN_DELTA is not a valid float: '%s'. Using 0.0.",
        _env_min_delta_str,
    )
    _parsed_min_delta = 0.0
EARLY_STOPPING_MIN_DELTA = max(0.0, _parsed_min_delta)

_env_min_samples_label = os.environ.get("MLP_MIN_SAMPLES_PER_LABEL", "1")
try:
    MIN_SAMPLES_PER_LABEL = max(1, int(_env_min_samples_label))
except ValueError:
    LOGGER.warning(
        "MLP_MIN_SAMPLES_PER_LABEL is not a valid integer: '%s'. Using 1.",
        _env_min_samples_label,
    )
    MIN_SAMPLES_PER_LABEL = 1

_env_min_samples_profile = os.environ.get("MLP_MIN_SAMPLES_PER_PROFILE", "1")
try:
    MIN_SAMPLES_PER_PROFILE = max(1, int(_env_min_samples_profile))
except ValueError:
    LOGGER.warning(
        "MLP_MIN_SAMPLES_PER_PROFILE is not a valid integer: '%s'. Using 1.",
        _env_min_samples_profile,
    )
    MIN_SAMPLES_PER_PROFILE = 1
DEPENDENCIES_REQUIRED = os.environ.get("MLP_REQUIRE_MEDIAPIPE", "1").lower() not in {
    "0",
    "false",
    "no",
}

LOSS_EPSILON = np.spacing(1.0)
AUGMENTATION_EPSILON = 1e-8

# Hand landmark constants for processing
LANDMARKS_PER_HAND = 21  # MediaPipe hand model provides 21 landmarks per hand
TOTAL_HAND_LANDMARKS = 42  # Left (21) + Right (21)
SECONDARY_HAND_WEIGHT = 0.3  # Weight for non-dominant hand in asymmetric gestures

# Still frames represent the precise target hand position for the gesture,
# so they should be weighted more heavily than individual video frames during averaging.
# Default weight of 10.0 means a single still frame has the same influence as 10 video frames.
STILL_FRAME_WEIGHT = float(os.environ.get("MLP_STILL_FRAME_WEIGHT", "10.0"))

# Quality thresholds
MIN_USABLE_FRAME_RATIO = float(os.environ.get("MLP_MIN_USABLE_FRAME_RATIO", "0.6"))
MIN_CLIP_DURATION_MS = float(os.environ.get("MLP_MIN_CLIP_DURATION_MS", "500"))
MIN_HANDS_COVERAGE = float(os.environ.get("MLP_MIN_HANDS_COVERAGE", "0.7"))
MIN_POSE_COVERAGE = float(os.environ.get("MLP_MIN_POSE_COVERAGE", "0.4"))
MIN_FACE_COVERAGE = float(os.environ.get("MLP_MIN_FACE_COVERAGE", "0.4"))
MIN_AVG_FRAME_DELTA_MS = float(os.environ.get("MLP_MIN_AVG_FRAME_DELTA_MS", "10"))
MAX_AVG_FRAME_DELTA_MS = float(os.environ.get("MLP_MAX_AVG_FRAME_DELTA_MS", "200"))

WeightTuple = Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]

def _emit_event(payload: Dict[str, object]) -> None:
    """Log a structured progress event."""

    message = json.dumps(payload)
    print(message, file=sys.stderr, flush=True)
    LOGGER.info(message)

# --- Data structures --------------------------------------------------------

@dataclass
class Sample:
    """Training sample produced from a bundle."""

    label: str
    profile_id: Optional[str]
    landmarks: List[List[float]]  # 42 hand landmarks (left+right), each [x, y, z]
    pose_landmarks: Optional[List[List[float]]] = None  # 33 pose landmarks, each [x, y, z, visibility]
    face_landmarks: Optional[List[List[float]]] = None  # 468 face landmarks, each [x, y, z]
    hand_focus: Optional[str] = None  # 'dominant_only', 'both_equal', 'both_asymmetric', 'either_hand', or None
    # Variation learning metadata (from webapp's SignVariationTracker)
    variation_cluster_id: Optional[str] = None  # Cluster ID from variation tracking
    variation_diversity: Optional[float] = None  # 0-1 score indicating variation diversity
    canonical_templates_count: Optional[int] = None  # Number of canonical templates for this gesture
    recording: Optional[Dict[str, object]] = None
    timing_stats: Optional[Dict[str, float]] = None
    modality_coverage: Optional[Dict[str, float]] = None


_UNSET = object()


@dataclass(frozen=True)
class TrainingConfig:
    """Configuration values that control the trainer's behaviour."""

    hidden_size: int = HIDDEN_SIZE
    epochs: int = EPOCHS
    learning_rate: float = LEARNING_RATE
    dropout_rate: float = DROPOUT_RATE
    validation_fraction: float = VALIDATION_FRACTION
    augmentations_per_sample: int = AUGMENTATIONS_PER_SAMPLE
    class_weight_smoothing: float = CLASS_WEIGHT_SMOOTHING
    early_stopping_patience: Optional[int] = EARLY_STOPPING_PATIENCE
    early_stopping_min_delta: float = EARLY_STOPPING_MIN_DELTA
    return_best_and_final: bool = False


@dataclass
class TrainingSnapshots:
    """Container for the best and terminal weights observed during training."""

    best_weights: WeightTuple
    final_weights: WeightTuple
    best_epoch: int
    final_epoch: int


# --- Helpers ----------------------------------------------------------------


def _max_l1(points: np.ndarray) -> float:
    """Return the maximum L1 norm across a set of 3D landmark points."""

    if points.size == 0:
        return 0.0
    return float(np.max(np.sum(np.abs(points), axis=1)))


def ensure_inside(base: Path, candidate: Path) -> Path:
    """Ensure candidate resolves within base directory."""

    resolved = candidate.resolve()
    if not str(resolved).startswith(str(base.resolve())):
        raise ValueError(f"Unsafe path outside data directory: {candidate}")
    return resolved


def resolve_relative_path(base: Path, relative: str) -> Optional[Path]:
    if not relative:
        return None
    normalized = relative.replace("\\", "/").lstrip("/")
    if not normalized:
        return None
    try:
        return ensure_inside(base, base / Path(normalized))
    except ValueError:
        return None


def select_landmarks_relative_path(entry: dict) -> str:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else None
    summary = metadata.get("validationSummary") if metadata else None
    if isinstance(summary, dict):
        path_candidate = summary.get("landmarksPath")
        if isinstance(path_candidate, str):
            normalized = path_candidate.replace("\\", "/").lstrip("/")
            if normalized:
                return normalized

    files = entry.get("storage", {}).get("files")
    if isinstance(files, list):
        for file in files:
            if not isinstance(file, str):
                continue
            normalized = file.replace("\\", "/").lstrip("/")
            if not normalized:
                continue
            base_name = normalized.split("/")[-1]
            if base_name == "landmarks.json":
                return normalized

    return "landmarks.json"


def load_json(path: Path) -> Optional[dict]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as err:
        print(f"warning: failed to parse JSON from {path}: {err}", file=sys.stderr)
        return None


def sha256_file(path: Path) -> Optional[str]:
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        return None
    digest = hashlib.sha256()
    digest.update(data)
    return digest.hexdigest()


def apply_hand_focus(
    landmarks: List[List[float]], 
    hand_focus: Optional[str],
    handedness: Optional[List[str]] = None,
) -> List[List[float]]:
    """Apply hand focus filter to landmarks by adjusting irrelevant hand data.
    
    For gestures where only one hand is semantically important, this function
    either zeroes out or weights down the landmarks for the non-relevant hand.
    This helps the model focus on the important hand and reduces noise.
    
    Hand Focus Types:
    - 'dominant_only': Zero out the non-dominant hand (based on motion or handedness)
    - 'both_equal': Keep both hands as-is
    - 'both_asymmetric': Weight non-dominant hand at 0.3x
    - 'either_hand': Keep both hands as-is (gesture works with any hand)
    
    Parameters
    ----------
    landmarks:
        42 hand landmarks (21 left + 21 right), each [x, y, z]
    hand_focus:
        Which hand(s) are important
    handedness:
        Optional list of handedness labels to help determine dominant hand
    
    Returns
    -------
    List[List[float]]
        Filtered/weighted landmarks
    """
    # Early return for no-op cases
    if hand_focus is None or hand_focus in ('both_equal', 'either_hand') or len(landmarks) < TOTAL_HAND_LANDMARKS:
        return landmarks
    
    result = [list(point) for point in landmarks]
    
    # Define index ranges for each hand
    left_hand_indices = range(LANDMARKS_PER_HAND)
    right_hand_indices = range(LANDMARKS_PER_HAND, TOTAL_HAND_LANDMARKS)
    
    # Track which hand indices to zero or weight
    hand_to_zero: Optional[range] = None
    hand_to_weight: Optional[range] = None
    
    if hand_focus in ('dominant_only', 'both_asymmetric'):
        # Count active landmarks per hand (landmarks with non-zero values)
        left_landmark_count = sum(1 for i in left_hand_indices if any(v != 0 for v in landmarks[i]))
        right_landmark_count = sum(1 for i in right_hand_indices if any(v != 0 for v in landmarks[i]))
        
        # Determine dominant hand from handedness labels or landmark counts
        dominant_is_right = True  # Default
        if handedness:
            has_right = any('right' in h.lower() for h in handedness)
            has_left = any('left' in h.lower() for h in handedness)
            if has_right and not has_left:
                dominant_is_right = True
            elif has_left and not has_right:
                dominant_is_right = False
            else:
                # Ambiguous (both or none detected), fallback to landmark count
                dominant_is_right = right_landmark_count >= left_landmark_count
        else:
            # Fallback to landmark count-based detection
            dominant_is_right = right_landmark_count >= left_landmark_count
        
        # Select secondary hand indices based on dominance
        secondary_hand_indices = left_hand_indices if dominant_is_right else right_hand_indices
        
        if hand_focus == 'dominant_only':
            hand_to_zero = secondary_hand_indices
        else:  # 'both_asymmetric'
            hand_to_weight = secondary_hand_indices
    
    # Apply zeroing to selected hand
    if hand_to_zero is not None:
        for i in hand_to_zero:
            result[i] = [0.0, 0.0, 0.0]
    
    # Apply weighting to selected hand
    if hand_to_weight is not None:
        for i in hand_to_weight:
            result[i] = [v * SECONDARY_HAND_WEIGHT for v in result[i]]
    
    return result


def flatten_landmarks_mean(frames: List[dict]) -> Optional[dict]:
    """Average multimodal landmarks across frames with optional weighting.
    
    Frames can include an optional 'weight' field to indicate their relative importance.
    Still frames typically have higher weights since they represent the precise target
    position for the gesture being trained.
    
    Parameters
    ----------
    frames:
        List of frame dictionaries, each containing:
        - 'landmarks' (required): hand landmarks
        - 'poseLandmarks' (optional): pose landmarks
        - 'faceLandmarks' (optional): face landmarks  
        - 'weight' (optional, default 1.0): frame importance
    
    Returns
    -------
    Optional[dict]
        Dictionary with averaged landmarks for each modality, or None if no valid frames.
        Keys: 'landmarks', 'poseLandmarks' (if present), 'faceLandmarks' (if present)
    """

    hand_collected: List[np.ndarray] = []
    pose_collected: List[np.ndarray] = []
    face_collected: List[np.ndarray] = []
    weights: List[float] = []
    
    for frame in frames:
        # Hand landmarks (required)
        coords = frame.get("landmarks")
        if not coords:
            continue
        arr = np.array(coords, dtype=np.float32).reshape(-1, 3)
        if arr.shape[0] < 42:
            padding = np.zeros((42 - arr.shape[0], 3), dtype=np.float32)
            arr = np.vstack([arr, padding])
        hand_collected.append(arr[:42])
        
        # Pose landmarks (optional)
        pose = frame.get("poseLandmarks")
        if pose:
            pose_arr = np.array(pose, dtype=np.float32).reshape(-1, 4)  # x, y, z, visibility
            if pose_arr.shape[0] < 33:
                padding = np.zeros((33 - pose_arr.shape[0], 4), dtype=np.float32)
                pose_arr = np.vstack([pose_arr, padding])
            pose_collected.append(pose_arr[:33])
        
        # Face landmarks (optional)
        face = frame.get("faceLandmarks")
        if face:
            face_arr = np.array(face, dtype=np.float32).reshape(-1, 3)
            if face_arr.shape[0] < 468:
                padding = np.zeros((468 - face_arr.shape[0], 3), dtype=np.float32)
                face_arr = np.vstack([face_arr, padding])
            face_collected.append(face_arr[:468])
        
        # Extract weight for this frame (default to 1.0 for backward compatibility)
        frame_weight = frame.get("weight", 1.0)
        weights.append(float(frame_weight))
    
    if not hand_collected:
        return None
    
    weights_array = np.array(weights, dtype=np.float32)
    total_weight = np.sum(weights_array)
    
    result = {}
    
    # Average hand landmarks
    stacked = np.stack(hand_collected, axis=0)
    if total_weight <= 0:
        averaged = stacked.mean(axis=0)
    else:
        averaged = np.average(stacked, axis=0, weights=weights_array)
    result['landmarks'] = averaged.tolist()
    
    # Average pose landmarks if present
    if pose_collected and len(pose_collected) == len(hand_collected):
        pose_stacked = np.stack(pose_collected, axis=0)
        if total_weight <= 0:
            pose_averaged = pose_stacked.mean(axis=0)
        else:
            pose_averaged = np.average(pose_stacked, axis=0, weights=weights_array)
        result['poseLandmarks'] = pose_averaged.tolist()
    
    # Average face landmarks if present
    if face_collected and len(face_collected) == len(hand_collected):
        face_stacked = np.stack(face_collected, axis=0)
        if total_weight <= 0:
            face_averaged = face_stacked.mean(axis=0)
        else:
            face_averaged = np.average(face_stacked, axis=0, weights=weights_array)
        result['faceLandmarks'] = face_averaged.tolist()
    
    return result


def _extract_recording_metadata(metadata: dict) -> Optional[Dict[str, object]]:
    recording = metadata.get("recording") if isinstance(metadata, dict) else None
    if not isinstance(recording, dict):
        return None
    cleaned: Dict[str, object] = {}
    for key in (
        "frameCount",
        "usableFrameCount",
        "clipDurationMs",
        "clipBytes",
        "clipMimeType",
        "stillBytes",
        "stillMimeType",
    ):
        value = recording.get(key)
        if isinstance(value, (int, float, str)):
            cleaned[key] = value
    return cleaned or None


def _extract_modality_coverage(metadata: dict) -> Optional[Dict[str, float]]:
    modalities = metadata.get("modalities") if isinstance(metadata, dict) else None
    if not isinstance(modalities, dict):
        return None
    coverage: Dict[str, float] = {}
    for key in ("hands", "pose", "face"):
        stats = modalities.get(key)
        if isinstance(stats, dict):
            raw = stats.get("coverage")
            if isinstance(raw, (int, float)) and math.isfinite(raw):
                coverage[key] = float(raw)
    return coverage or None


def _analyze_frame_timing(frames: List[dict]) -> Optional[Dict[str, float]]:
    timestamps: List[float] = []
    for frame in frames:
        value = frame.get("timestampMs")
        if isinstance(value, (int, float)) and math.isfinite(value):
            timestamps.append(float(value))
    if len(timestamps) < 2:
        return None
    deltas: List[float] = []
    non_monotonic = False
    for idx in range(1, len(timestamps)):
        delta = timestamps[idx] - timestamps[idx - 1]
        if delta <= 0:
            non_monotonic = True
        if delta > 0:
            deltas.append(delta)
    if not deltas:
        return {"nonMonotonic": True}
    avg_delta = float(sum(deltas) / len(deltas))
    variance = float(
        sum((delta - avg_delta) ** 2 for delta in deltas) / len(deltas)
    )
    return {
        "nonMonotonic": non_monotonic,
        "averageDeltaMs": avg_delta,
        "minDeltaMs": float(min(deltas)),
        "maxDeltaMs": float(max(deltas)),
        "varianceDeltaMs": variance,
    }


def _apply_timing_weights(frames: List[dict]) -> Optional[Dict[str, float]]:
    timestamps: List[Tuple[int, float]] = []
    for idx, frame in enumerate(frames):
        value = frame.get("timestampMs")
        if isinstance(value, (int, float)) and math.isfinite(value):
            timestamps.append((idx, float(value)))
    if len(timestamps) < 2:
        return None
    deltas: List[float] = []
    for idx in range(1, len(timestamps)):
        delta = timestamps[idx][1] - timestamps[idx - 1][1]
        if delta > 0:
            deltas.append(delta)
    if not deltas:
        return {"nonMonotonic": True}
    avg_delta = float(sum(deltas) / len(deltas))
    if avg_delta <= 0:
        return {"nonMonotonic": True}
    for idx in range(1, len(timestamps)):
        delta = timestamps[idx][1] - timestamps[idx - 1][1]
        if delta <= 0:
            continue
        weight = delta / avg_delta
        frame_index = timestamps[idx][0]
        existing = frames[frame_index].get("weight", 1.0)
        try:
            frames[frame_index]["weight"] = float(existing) * float(weight)
        except (TypeError, ValueError):
            frames[frame_index]["weight"] = float(weight)
    return _analyze_frame_timing(frames)


def _compute_quality_weight(sample: Sample) -> float:
    weight = 1.0
    recording = sample.recording or {}
    frame_count = recording.get("frameCount")
    usable_count = recording.get("usableFrameCount")
    if isinstance(frame_count, (int, float)) and isinstance(usable_count, (int, float)) and frame_count > 0:
        ratio = float(usable_count) / float(frame_count)
        if ratio < MIN_USABLE_FRAME_RATIO:
            weight *= 0.7
        if ratio < MIN_USABLE_FRAME_RATIO * 0.5:
            weight *= 0.7

    clip_duration = recording.get("clipDurationMs")
    if isinstance(clip_duration, (int, float)) and clip_duration > 0 and clip_duration < MIN_CLIP_DURATION_MS:
        weight *= 0.75

    timing = sample.timing_stats or {}
    avg_delta = timing.get("averageDeltaMs")
    if isinstance(avg_delta, (int, float)) and (
        avg_delta < MIN_AVG_FRAME_DELTA_MS or avg_delta > MAX_AVG_FRAME_DELTA_MS
    ):
        weight *= 0.8
    if timing.get("nonMonotonic"):
        weight *= 0.6

    coverage = sample.modality_coverage or {}
    hands_cov = coverage.get("hands")
    if isinstance(hands_cov, (int, float)) and hands_cov < MIN_HANDS_COVERAGE:
        weight *= 0.6
    pose_cov = coverage.get("pose")
    if isinstance(pose_cov, (int, float)) and pose_cov < MIN_POSE_COVERAGE:
        weight *= 0.85
    face_cov = coverage.get("face")
    if isinstance(face_cov, (int, float)) and face_cov < MIN_FACE_COVERAGE:
        weight *= 0.9

    return max(weight, 0.1)


def _summarize_recording_stats(samples: List[Sample]) -> Dict[str, object]:
    frame_counts: List[float] = []
    usable_counts: List[float] = []
    clip_durations: List[float] = []
    timing_variances: List[float] = []
    non_monotonic = 0
    for sample in samples:
        recording = sample.recording or {}
        frame_count = recording.get("frameCount")
        usable_count = recording.get("usableFrameCount")
        clip_duration = recording.get("clipDurationMs")
        if isinstance(frame_count, (int, float)):
            frame_counts.append(float(frame_count))
        if isinstance(usable_count, (int, float)):
            usable_counts.append(float(usable_count))
        if isinstance(clip_duration, (int, float)):
            clip_durations.append(float(clip_duration))
        timing = sample.timing_stats or {}
        variance = timing.get("varianceDeltaMs")
        if isinstance(variance, (int, float)) and math.isfinite(variance):
            timing_variances.append(float(variance))
        if timing.get("nonMonotonic"):
            non_monotonic += 1

    def _avg(values: List[float]) -> Optional[float]:
        return float(sum(values) / len(values)) if values else None

    return {
        "samplesWithRecording": len(frame_counts),
        "averageFrameCount": _avg(frame_counts),
        "averageUsableFrameCount": _avg(usable_counts),
        "averageClipDurationMs": _avg(clip_durations),
        "averageTimingVarianceMs": _avg(timing_variances),
        "nonMonotonicTimingSamples": non_monotonic,
    }


def extract_landmarks_from_clip(clip_path: Path) -> List[dict]:
    """Run MediaPipe on a clip and return landmark dictionaries."""
    _require_hand_landmark_dependencies(f"Videoclip {clip_path}")
    if cv2 is None or mp is None:
        return []

    frames: List[dict] = []
    cap = cv2.VideoCapture(str(clip_path))
    if not cap.isOpened():
        print(f"warning: unable to open clip {clip_path}", file=sys.stderr)
        return frames

    # 1. Try modern Tasks API (highly robust for new MP versions)
    if mp_tasks and mp_vision:
        models_dir = Path(__file__).resolve().parents[2] / "data" / "models"
        if not models_dir.exists():
            models_dir = Path("server/data/models")
        
        hand_model = models_dir / "hand_landmarker.task"
        pose_model = models_dir / "pose_landmarker.task"
        face_model = models_dir / "face_landmarker.task"
        
        # Try full multimodal if all models available
        if hand_model.exists() and pose_model.exists() and face_model.exists():
            try:
                base_options = mp_tasks.BaseOptions(model_asset_path=str(model_path))
                options = mp_vision.HandLandmarkerOptions(
                    base_options=base_options, 
                    num_hands=2,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                with mp_vision.HandLandmarker.create_from_options(options) as landmarker:
                    index = 0
                    while cap.isOpened() and len(frames) < MAX_FRAMES_PER_CLIP:
                        success, frame = cap.read()
                        if not success:
                            break
                        if index % FRAME_STRIDE != 0:
                            index += 1
                            continue

                        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                        result = landmarker.detect(mp_image)

                        left = np.zeros((21, 3), dtype=np.float32)
                        right = np.zeros((21, 3), dtype=np.float32)

                        if result.hand_landmarks:
                            for i, hand_lms in enumerate(result.hand_landmarks):
                                coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_lms], dtype=np.float32)
                                # Handedness is inverted in some MP versions relative to camera
                                category = result.handedness[i][0].category_name
                                if category == "Left":
                                    left[:] = coords
                                else:
                                    right[:] = coords

                        combined = np.vstack([left, right])
                        frames.append({"landmarks": combined.tolist()})
                        index += 1
                return frames
            except Exception as e:
                print(f"warning: Hands-only Tasks API failed: {e}", file=sys.stderr)

    # 2. Try multimodal Tasks API fallback
    if mp_tasks and mp_vision:
        models_dir = Path(__file__).resolve().parents[2] / "data" / "models"
        if not models_dir.exists():
            models_dir = Path("server/data/models")
        
        hand_model = models_dir / "hand_landmarker.task"
        pose_model = models_dir / "pose_landmarker.task"
        face_model = models_dir / "face_landmarker.task"
        
        if hand_model.exists() and pose_model.exists() and face_model.exists():
            try:
                # Initialize all landmarkers
                hand_base_options = mp_tasks.BaseOptions(model_asset_path=str(hand_model))
                hand_options = mp_vision.HandLandmarkerOptions(
                    base_options=hand_base_options, 
                    num_hands=2,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                
                pose_base_options = mp_tasks.BaseOptions(model_asset_path=str(pose_model))
                pose_options = mp_vision.PoseLandmarkerOptions(
                    base_options=pose_base_options,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                
                face_base_options = mp_tasks.BaseOptions(model_asset_path=str(face_model))
                face_options = mp_vision.FaceLandmarkerOptions(
                    base_options=face_base_options,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                
                with mp_vision.HandLandmarker.create_from_options(hand_options) as hand_landmarker, \
                     mp_vision.PoseLandmarker.create_from_options(pose_options) as pose_landmarker, \
                     mp_vision.FaceLandmarker.create_from_options(face_options) as face_landmarker:
                    
                    index = 0
                    while cap.isOpened() and len(frames) < MAX_FRAMES_PER_CLIP:
                        success, frame = cap.read()
                        if not success:
                            break
                        if index % FRAME_STRIDE != 0:
                            index += 1
                            continue

                        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                        
                        # Extract all landmarks
                        hand_result = hand_landmarker.detect(mp_image)
                        pose_result = pose_landmarker.detect(mp_image)
                        face_result = face_landmarker.detect(mp_image)

                        left = np.zeros((21, 3), dtype=np.float32)
                        right = np.zeros((21, 3), dtype=np.float32)
                        pose_landmarks = []
                        face_landmarks = []

                        # Process hand landmarks
                        if hand_result.hand_landmarks:
                            for i, hand_lms in enumerate(hand_result.hand_landmarks):
                                coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_lms], dtype=np.float32)
                                category = hand_result.handedness[i][0].category_name
                                if category == "Left":
                                    left[:] = coords
                                else:
                                    right[:] = coords

                        # Process pose landmarks
                        if pose_result.pose_landmarks:
                            pose_landmarks = [
                                [lm.x, lm.y, lm.z, lm.visibility] 
                                for lm in pose_result.pose_landmarks[0]
                            ]
                        
                        # Process face landmarks
                        if face_result.face_landmarks:
                            face_landmarks = [
                                [lm.x, lm.y, lm.z] 
                                for lm in face_result.face_landmarks[0]
                            ]

                        combined = np.vstack([left, right])
                        frame_data = {"landmarks": combined.tolist()}
                        
                        # Add multimodal data if available
                        if pose_landmarks:
                            frame_data["poseLandmarks"] = pose_landmarks
                        if face_landmarks:
                            frame_data["faceLandmarks"] = face_landmarks
                            
                        frames.append(frame_data)
                        index += 1
                return frames
            except Exception as e:
                print(f"warning: Multimodal Tasks API failed: {e}", file=sys.stderr)
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0) # Reset video
        
        # Fallback to hands-only Tasks API if multimodal models unavailable
        if hand_model.exists():
            try:
                base_options = mp_tasks.BaseOptions(model_asset_path=str(hand_model))
                options = mp_vision.HandLandmarkerOptions(
                    base_options=base_options, 
                    num_hands=2,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                with mp_vision.HandLandmarker.create_from_options(options) as landmarker:
                    index = 0
                    while cap.isOpened() and len(frames) < MAX_FRAMES_PER_CLIP:
                        success, frame = cap.read()
                        if not success:
                            break
                        if index % FRAME_STRIDE != 0:
                            index += 1
                            continue

                        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                        result = landmarker.detect(mp_image)

                        left = np.zeros((21, 3), dtype=np.float32)
                        right = np.zeros((21, 3), dtype=np.float32)

                        if result.hand_landmarks:
                            for i, hand_lms in enumerate(result.hand_landmarks):
                                coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_lms], dtype=np.float32)
                                # Handedness is inverted in some MP versions relative to camera
                                category = result.handedness[i][0].category_name
                                if category == "Left":
                                    left[:] = coords
                                else:
                                    right[:] = coords

                        combined = np.vstack([left, right])
                        frames.append({"landmarks": combined.tolist()})
                        index += 1
                return frames
            except Exception as e:
                print(f"warning: Hands-only Tasks API failed: {e}", file=sys.stderr)
    
    # Legacy solutions not available in current MediaPipe version
    
    return frames


def extract_landmarks_from_still(still_path: Path) -> Optional[dict]:
    """Run MediaPipe Tasks API on a still image and return multimodal landmark frame."""

    _require_hand_landmark_dependencies(f"Standbild {still_path}")
    if cv2 is None or mp is None:
        return None

    image = cv2.imread(str(still_path))
    if image is None:
        print(f"warning: unable to read still {still_path}", file=sys.stderr)
        return None

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Try Tasks API for multimodal capture
    if mp_tasks and mp_vision:
        models_dir = Path(__file__).resolve().parents[2] / "data" / "models"
        if not models_dir.exists():
            models_dir = Path("server/data/models")
        
        hand_model = models_dir / "hand_landmarker.task"
        pose_model = models_dir / "pose_landmarker.task"
        face_model = models_dir / "face_landmarker.task"
        
        # Try full multimodal if all models available
        if hand_model.exists() and pose_model.exists() and face_model.exists():
            try:
                # Initialize all landmarkers
                hand_base_options = mp_tasks.BaseOptions(model_asset_path=str(hand_model))
                hand_options = mp_vision.HandLandmarkerOptions(
                    base_options=hand_base_options, 
                    num_hands=2,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                
                pose_base_options = mp_tasks.BaseOptions(model_asset_path=str(pose_model))
                pose_options = mp_vision.PoseLandmarkerOptions(
                    base_options=pose_base_options,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                
                face_base_options = mp_tasks.BaseOptions(model_asset_path=str(face_model))
                face_options = mp_vision.FaceLandmarkerOptions(
                    base_options=face_base_options,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                
                with mp_vision.HandLandmarker.create_from_options(hand_options) as hand_landmarker, \
                     mp_vision.PoseLandmarker.create_from_options(pose_options) as pose_landmarker, \
                     mp_vision.FaceLandmarker.create_from_options(face_options) as face_landmarker:
                    
                    # Extract all landmarks
                    hand_result = hand_landmarker.detect(mp_image)
                    pose_result = pose_landmarker.detect(mp_image)
                    face_result = face_landmarker.detect(mp_image)

                    left = np.zeros((21, 3), dtype=np.float32)
                    right = np.zeros((21, 3), dtype=np.float32)
                    pose_landmarks = []
                    face_landmarks = []

                    # Process hand landmarks
                    if hand_result.hand_landmarks:
                        for i, hand_lms in enumerate(hand_result.hand_landmarks):
                            coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_lms], dtype=np.float32)
                            category = hand_result.handedness[i][0].category_name
                            if category == "Left":
                                left[:] = coords
                            else:
                                right[:] = coords

                    # Process pose landmarks
                    if pose_result.pose_landmarks:
                        pose_landmarks = [
                            [lm.x, lm.y, lm.z, lm.visibility] 
                            for lm in pose_result.pose_landmarks[0]
                        ]
                    
                    # Process face landmarks
                    if face_result.face_landmarks:
                        face_landmarks = [
                            [lm.x, lm.y, lm.z] 
                            for lm in face_result.face_landmarks[0]
                        ]
                    
                    combined = np.vstack([left, right])
                    frame_data = {"landmarks": combined.tolist()}
                    
                    # Add multimodal data if available
                    if pose_landmarks:
                        frame_data["poseLandmarks"] = pose_landmarks
                    if face_landmarks:
                        frame_data["faceLandmarks"] = face_landmarks
                        
                    return frame_data
            except Exception as e:
                print(f"warning: Multimodal Tasks API failed for still image: {e}", file=sys.stderr)
        
        # Fallback to hands-only Tasks API
        if hand_model.exists():
            try:
                base_options = mp_tasks.BaseOptions(model_asset_path=str(hand_model))
                options = mp_vision.HandLandmarkerOptions(
                    base_options=base_options, 
                    num_hands=2,
                    running_mode=mp_vision.RunningMode.IMAGE
                )
                
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                
                with mp_vision.HandLandmarker.create_from_options(options) as landmarker:
                    result = landmarker.detect(mp_image)
 
                    left = np.zeros((21, 3), dtype=np.float32)
                    right = np.zeros((21, 3), dtype=np.float32)
 
                    if result.hand_landmarks:
                        for i, hand_lms in enumerate(result.hand_landmarks):
                            coords = np.array([[lm.x, lm.y, lm.z] for lm in hand_lms], dtype=np.float32)
                            category = result.handedness[i][0].category_name
                            if category == "Left":
                                left[:] = coords
                            else:
                                right[:] = coords
 
                    combined = np.vstack([left, right])
                    return {"landmarks": combined.tolist()}
            except Exception as e:
                print(f"warning: Hands-only Tasks API failed for still image: {e}", file=sys.stderr)
    
    # Fallback if Tasks API fails or unavailable
    print(f"warning: Unable to extract landmarks from {still_path}", file=sys.stderr)
    return None


def filter_samples_by_profile(samples: Iterable[Sample], profile_id: str) -> List[Sample]:
    """Return samples for a profile-specific model.

    Includes:
    1. All samples explicitly belonging to this profile.
    2. All global samples (no profile_id) whose labels are NOT overridden
       by this profile.

    This ensures the profile model is a specialized superset of the global model,
    supporting custom sign languages per child without losing baseline gestures.
    """
    return filter_by_profile_logic(
        list(samples),
        profile_id,
        get_label=lambda s: s.label,
        get_profile_id=lambda s: s.profile_id
    )


def _normalize(lm):
    """Normalize one or two hands to be wrist-centered and scale-invariant."""
    if not lm or len(lm) < 21:
        return None

    if isinstance(lm[0], list) and len(lm[0]) == 3:
        pts = np.array(lm[:42])
    else:
        flat_lm = lm[:126] if len(lm) >= 126 else lm + [0.0] * (126 - len(lm))
        pts = np.array(flat_lm).reshape(42, 3)

    if len(pts) < 42:
        pad = np.zeros((42 - len(pts), 3))
        pts = np.vstack([pts, pad])

    def _norm_hand(hand: np.ndarray) -> np.ndarray:
        wrist = hand[0]
        hand = hand - wrist
        max_dist = _max_l1(hand)
        if max_dist == 0:
            return hand
        hand /= max_dist
        return hand

    left = _norm_hand(pts[:21])
    right = _norm_hand(pts[21:]) if pts.shape[0] >= 42 else np.zeros_like(pts[:21])

    return np.concatenate([left, right]).flatten()


def _normalize_multimodal(sample: Sample) -> Optional[np.ndarray]:
    """Normalize multimodal sample (hands + optional pose/face) into a feature vector.
    
    The feature vector includes:
    - Hand landmarks (126 values): normalized and flattened
    - Pose landmarks (optional, 99 values): x,y,z for 33 points, normalized to torso center
    - Face landmarks (optional, subset ~60 values): key facial points for NMMs
    
    This function naturally supports modality dropout: when pose or face landmarks are
    missing from a sample, zeros are filled in. This trains the model to be robust to
    missing modalities, which can occur due to occlusion, poor lighting, or device limitations.
    
    Returns None if hand landmarks cannot be normalized.
    """
    # Normalize hand landmarks (required)
    hand_features = _normalize(sample.landmarks)
    if hand_features is None:
        return None
    
    features = [hand_features]
    
    # Add pose landmarks if present
    if sample.pose_landmarks:
        pose_arr = np.array(sample.pose_landmarks, dtype=np.float32)
        if pose_arr.shape[0] >= 33:
            # Use only x,y,z (drop visibility for now)
            pose_xyz = pose_arr[:33, :3]
            # Normalize to torso center (average of shoulders and hips)
            torso_indices = [11, 12, 23, 24]  # shoulders and hips
            torso_center = pose_xyz[torso_indices].mean(axis=0)
            pose_normalized = pose_xyz - torso_center
            # Scale by shoulder width for scale invariance
            shoulder_width = np.linalg.norm(pose_xyz[11] - pose_xyz[12])
            if shoulder_width > 0:
                pose_normalized /= shoulder_width
            features.append(pose_normalized.flatten())
        else:
            # Pose landmarks missing or incomplete - add zeros
            features.append(np.zeros(99, dtype=np.float32))
    else:
        # No pose data - add zeros to maintain consistent feature size
        features.append(np.zeros(99, dtype=np.float32))
    
    # Add face landmarks if present (use subset for efficiency)
    if sample.face_landmarks:
        face_arr = np.array(sample.face_landmarks, dtype=np.float32)
        if face_arr.shape[0] >= 468:
            # Key facial points for NMMs (eyes, mouth, brows)
            key_indices = [
                33, 133, 362, 263,  # eyes (4)
                1,  # nose tip (1)
                13, 14,  # lips (2)
                61, 291,  # mouth corners (2)
                70, 300,  # brows (2)
                # Add more key points as needed
            ]
            face_subset = face_arr[key_indices, :3]  # x,y,z only
            # Normalize to nose tip
            nose = face_arr[1, :3]
            face_normalized = face_subset - nose
            # Scale by eye distance
            eye_dist = np.linalg.norm(face_arr[33, :3] - face_arr[263, :3])
            if eye_dist > 0:
                face_normalized /= eye_dist
            features.append(face_normalized.flatten())
        else:
            # Face landmarks missing or incomplete
            features.append(np.zeros(33, dtype=np.float32))  # 11 points * 3
    else:
        # No face data
        features.append(np.zeros(33, dtype=np.float32))
    
    return np.concatenate(features)


def augment_landmarks(
    normalized: Union[List[float], np.ndarray],
    *,
    rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None,
    jitter_std: float = 0.01,
    max_rotation_degrees: float = 10.0,
) -> np.ndarray:
    """Perturb normalized landmarks while keeping wrists centered and unit scale.

    Parameters
    ----------
    normalized:
        Flattened 42x3 landmark tensor produced by :func:`_normalize`.
    rng:
        Optional random number generator for deterministic tests.
    jitter_std:
        Standard deviation of per-point jitter applied to each coordinate (except
        the wrist anchor point for each hand).
    max_rotation_degrees:
        Maximum absolute in-plane rotation applied to both hands. Rotation keeps
        the wrists stationary and does not introduce additional translation or
        global scaling.

    Returns
    -------
    numpy.ndarray
        Augmented landmark tensor with the same shape as the input.
    """

    if jitter_std < 0:
        raise ValueError(f"jitter_std must be non-negative, got {jitter_std}")
    if max_rotation_degrees < 0:
        raise ValueError(
            f"max_rotation_degrees must be non-negative, got {max_rotation_degrees}"
        )

    base = np.asarray(normalized, dtype=np.float32).reshape(42, 3)
    augmented = base.copy()

    if rng is None:
        rng = np.random.default_rng()

    def _rotate_xy(points: np.ndarray, radians: float) -> None:
        if abs(radians) < AUGMENTATION_EPSILON:
            return
        cos_a = math.cos(radians)
        sin_a = math.sin(radians)
        rotation = np.array([[cos_a, -sin_a], [sin_a, cos_a]], dtype=np.float32)
        points[:, :2] = points[:, :2] @ rotation.T

    # Sample a shared rotation for both hands to maintain their relative layout.
    rotation_radians = math.radians(
        rng.uniform(-max_rotation_degrees, max_rotation_degrees)
    )

    for offset in (0, 21):
        hand = augmented[offset : offset + 21]
        base_hand = base[offset : offset + 21]
        if not np.any(base_hand):
            continue

        if jitter_std > 0.0:
            noise = rng.normal(0.0, jitter_std, size=hand.shape).astype(np.float32)
            noise[0] = 0.0  # Keep wrist anchor fixed
            hand += noise

        _rotate_xy(hand, rotation_radians)

        # Keep wrists exactly anchored and respect missing joints.
        present = np.any(base_hand, axis=1)
        present[0] = True  # Always keep the wrist entry
        hand[~present] = 0.0

        # Re-normalize the entire hand to restore the unit-scale invariant without
        # distorting relative joint geometry.
        max_l1 = _max_l1(hand)
        if max_l1 <= AUGMENTATION_EPSILON:
            # Revert to the original geometry while preserving the shared rotation.
            hand[:] = base_hand
            _rotate_xy(hand, rotation_radians)
            max_l1_reverted = _max_l1(hand)
            if max_l1_reverted > AUGMENTATION_EPSILON:
                hand /= max_l1_reverted
        else:
            hand /= max_l1

    return augmented.astype(np.float32).flatten()


def augment_multimodal_landmarks(
    normalized: Union[List[float], np.ndarray],
    *,
    rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None,
    jitter_std: float = 0.01,
    max_rotation_degrees: float = 10.0,
) -> np.ndarray:
    """Augment multimodal landmarks (hands + pose + face).
    
    Parameters
    ----------
    normalized:
        Flattened multimodal feature vector (126 hand + 99 pose + 33 face = 258 values).
    rng:
        Optional random number generator for deterministic tests.
    jitter_std:
        Standard deviation of per-point jitter applied to each coordinate.
    max_rotation_degrees:
        Maximum absolute in-plane rotation applied to hands.
        
    Returns
    -------
    numpy.ndarray
        Augmented multimodal landmark tensor with the same shape as the input.
    """
    # Jitter scaling factors to preserve structure of different modalities
    POSE_JITTER_SCALE = 0.5  # Reduced variance for pose to maintain body structure
    FACE_JITTER_SCALE = 0.3  # Reduced variance for face to maintain facial structure
    
    if rng is None:
        rng = np.random.default_rng()
        
    features = np.asarray(normalized, dtype=np.float32)
    
    # Split into hand, pose, and face components
    # Expected: 126 (hands) + 99 (pose) + 33 (face) = 258
    hand_size = 126  # 42 points * 3 coords
    pose_size = 99   # 33 points * 3 coords
    face_size = 33   # 11 points * 3 coords
    
    if len(features) != hand_size + pose_size + face_size:
        # If size doesn't match expected multimodal format, return as-is
        return features
    
    # Augment hand landmarks using existing augmentation
    hand_features = features[:hand_size]
    augmented_hands = augment_landmarks(
        hand_features, 
        rng=rng, 
        jitter_std=jitter_std, 
        max_rotation_degrees=max_rotation_degrees
    )
    
    # Apply minimal jitter to pose (smaller variance to maintain body structure)
    pose_features = features[hand_size:hand_size + pose_size].reshape(33, 3)
    if np.any(pose_features):
        pose_jitter = rng.normal(0.0, jitter_std * POSE_JITTER_SCALE, size=pose_features.shape).astype(np.float32)
        pose_features = pose_features + pose_jitter
    augmented_pose = pose_features.flatten()
    
    # Apply minimal jitter to face (smaller variance to maintain facial structure)
    face_features = features[hand_size + pose_size:].reshape(11, 3)
    if np.any(face_features):
        face_jitter = rng.normal(0.0, jitter_std * FACE_JITTER_SCALE, size=face_features.shape).astype(np.float32)
        face_features = face_features + face_jitter
    augmented_face = face_features.flatten()
    
    return np.concatenate([augmented_hands, augmented_pose, augmented_face])



# --- MLP implementation (unchanged core) ------------------------------------


def relu(x):
    return np.maximum(0, x)


def relu_derivative(x):
    return np.where(x > 0, 1, 0)


def softmax(x):
    e_x = np.exp(x - np.max(x, axis=1, keepdims=True))
    return e_x / np.sum(e_x, axis=1, keepdims=True)


def _forward(
    X: np.ndarray,
    w1: np.ndarray,
    b1: np.ndarray,
    w2: np.ndarray,
    b2: np.ndarray,
) -> np.ndarray:
    """Single forward pass through the MLP returning class probabilities."""

    z1 = np.dot(X, w1) + b1
    a1 = relu(z1)
    z2 = np.dot(a1, w2) + b2
    return softmax(z2)


def train_mlp(
    X,
    y,
    output_size,
    *,
    config: Optional[TrainingConfig] = None,
    hidden_size: Optional[int] = _UNSET,
    epochs: Optional[int] = _UNSET,
    learning_rate: Optional[float] = _UNSET,
    dropout_rate: Optional[float] = _UNSET,
    early_stopping_patience: Optional[int] = _UNSET,
    early_stopping_min_delta: Optional[float] = _UNSET,
    sample_weights: Optional[np.ndarray] = None,
    validation_data: Optional[Tuple[np.ndarray, np.ndarray]] = None,
    validation_sample_weights: Optional[np.ndarray] = None,
    rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None,
    return_best_and_final: Optional[bool] = _UNSET,
) -> Union[WeightTuple, TrainingSnapshots]:
    resolved = config or TrainingConfig()

    overrides = {
        field: value
        for field, value in {
            "hidden_size": hidden_size,
            "epochs": epochs,
            "learning_rate": learning_rate,
            "dropout_rate": dropout_rate,
            "early_stopping_patience": early_stopping_patience,
            "early_stopping_min_delta": early_stopping_min_delta,
            "return_best_and_final": return_best_and_final,
        }.items()
        if value is not _UNSET
    }
    if overrides:
        resolved = replace(resolved, **overrides)

    hidden_size = resolved.hidden_size
    epochs = resolved.epochs
    learning_rate = resolved.learning_rate
    dropout_rate = resolved.dropout_rate
    early_stopping_patience = resolved.early_stopping_patience
    early_stopping_min_delta = resolved.early_stopping_min_delta
    return_best_and_final_flag = resolved.return_best_and_final

    input_size = X.shape[1]

    random_source = np.random if rng is None else rng

    num_samples = X.shape[0]

    train_weights = None
    train_weight_sum = float(num_samples)
    if sample_weights is not None:
        candidate = np.asarray(sample_weights, dtype=np.float32)
        if candidate.shape[0] == num_samples and candidate.size > 0:
            weight_sum = float(np.sum(candidate))
            if weight_sum > 0:
                train_weights = candidate
                train_weight_sum = weight_sum

    validation_X: Optional[np.ndarray] = None
    validation_y: Optional[np.ndarray] = None
    validation_weights = None
    validation_weight_sum: Optional[float] = None
    if validation_data is not None:
        validation_X, validation_y = validation_data
        if validation_X.size and validation_y.size:
            if validation_sample_weights is not None:
                candidate_val = np.asarray(validation_sample_weights, dtype=np.float32)
                if candidate_val.shape[0] == validation_y.shape[0]:
                    val_sum = float(np.sum(candidate_val))
                    if val_sum > 0:
                        validation_weights = candidate_val
                        validation_weight_sum = val_sum

    def _sample_from_rng(rs, shape, *, distribution: str) -> np.ndarray:
        """Generate samples from ``rs`` while handling common RNG APIs."""

        if distribution not in {"normal", "uniform"}:
            raise ValueError(
                f"Unsupported distribution '{distribution}'. Supported distributions are 'normal' and 'uniform'."
            )

        # numpy Generator/RandomState cover the primary cases.
        if isinstance(rs, (np.random.Generator, np.random.RandomState)):
            if distribution == "normal":
                return rs.standard_normal(size=shape)
            return rs.random(size=shape)

        # Allow custom RNG stubs that expose ``randn``/``rand`` or ``normal``/``uniform``.
        if distribution == "normal":
            if hasattr(rs, "standard_normal"):
                return rs.standard_normal(size=shape)
            if hasattr(rs, "normal"):
                return rs.normal(size=shape)
            if hasattr(rs, "randn"):
                return rs.randn(*shape)
            return np.random.standard_normal(size=shape)

        # distribution == "uniform"
        if hasattr(rs, "random"):
            return rs.random(size=shape)
        if hasattr(rs, "uniform"):
            return rs.uniform(size=shape)
        if hasattr(rs, "rand"):
            return rs.rand(*shape)
        return np.random.random(size=shape)

    w1 = _sample_from_rng(random_source, (input_size, hidden_size), distribution="normal") * 0.01
    b1 = np.zeros(hidden_size)
    w2 = _sample_from_rng(random_source, (hidden_size, output_size), distribution="normal") * 0.01
    b2 = np.zeros(output_size)

    num_samples = X.shape[0]
    sanitized_dropout = max(0.0, min(1.0, dropout_rate))
    keep_prob = 1.0 - sanitized_dropout
    use_dropout = keep_prob < 1.0

    best_loss = math.inf
    best_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy())
    epochs_without_improvement = 0
    patience_enabled = (
        early_stopping_patience is not None and early_stopping_patience > 0
    )
    min_delta = max(0.0, early_stopping_min_delta)
    best_epoch = 0

    final_epoch = 0

    for epoch in range(epochs):
        current_epoch = epoch + 1
        z1 = np.dot(X, w1) + b1
        a1 = relu(z1)
        dropout_mask = None
        if use_dropout:
            dropout_mask = (
                _sample_from_rng(
                    random_source, (num_samples, hidden_size), distribution="uniform"
                )
                < keep_prob
            ).astype(
                a1.dtype
            )
            if keep_prob > 0.0:
                dropout_mask /= keep_prob
            a1 *= dropout_mask
        z2 = np.dot(a1, w2) + b2
        probs = softmax(z2)

        # Guard against log(0) or log(1) from floating-point underflow/overflow at extreme learning rates.
        p = np.clip(probs[np.arange(num_samples), y], LOSS_EPSILON, 1.0 - LOSS_EPSILON)
        log_probs = -np.log(p)
        if train_weights is not None:
            loss = float(np.sum(log_probs * train_weights) / train_weight_sum)
        else:
            loss = float(np.sum(log_probs) / num_samples)

        validation_loss = None
        if validation_X is not None and validation_y is not None and validation_X.size:
            val_probs = _forward(validation_X, w1, b1, w2, b2)
            v = np.clip(
                val_probs[np.arange(validation_y.shape[0]), validation_y],
                LOSS_EPSILON,
                1.0 - LOSS_EPSILON,
            )
            val_logs = -np.log(v)
            if validation_weights is not None and validation_weight_sum:
                validation_loss = float(np.sum(val_logs * validation_weights) / validation_weight_sum)
            else:
                validation_loss = float(np.sum(val_logs) / validation_y.shape[0])

        monitor_loss = validation_loss if validation_loss is not None else loss
        if epoch % max(1, epochs // 10) == 0:
            _emit_event(
                {
                    "type": "progress",
                    "epoch": epoch + 1,
                    "total": epochs,
                    "loss": f"{loss:.4f}",
                    **({"validationLoss": f"{validation_loss:.4f}"} if validation_loss is not None else {}),
                }
            )

        stop_after_epoch = False

        if monitor_loss < best_loss - min_delta:
            best_loss = monitor_loss
            best_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy())
            best_epoch = current_epoch
            epochs_without_improvement = 0
        else:
            if patience_enabled:
                epochs_without_improvement += 1
                if epochs_without_improvement >= early_stopping_patience:
                    _emit_event(
                        {
                            "type": "early_stop",
                            "epoch": current_epoch,
                            "bestLoss": f"{best_loss:.4f}",
                            "bestEpoch": best_epoch,
                            "config": {
                                "patience": early_stopping_patience,
                                "minDelta": f"{min_delta:.6f}",
                            },
                        }
                    )
                    stop_after_epoch = True

        dz2 = probs
        dz2[np.arange(num_samples), y] -= 1
        if train_weights is not None:
            dz2 *= (train_weights / train_weight_sum)[:, None]
        else:
            dz2 /= num_samples

        dw2 = np.dot(a1.T, dz2)
        db2 = np.sum(dz2, axis=0)

        da1 = np.dot(dz2, w2.T)
        if dropout_mask is not None:
            da1 *= dropout_mask
        dz1 = da1 * relu_derivative(z1)

        dw1 = np.dot(X.T, dz1)
        db1 = np.sum(dz1, axis=0)

        w1 -= learning_rate * dw1
        b1 -= learning_rate * db1
        w2 -= learning_rate * dw2
        b2 -= learning_rate * db2

        final_epoch = current_epoch

        if stop_after_epoch:
            break

    final_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy())

    if return_best_and_final_flag:
        # Return both snapshots so callers can observe whether early stopping diverged from
        # the terminal epoch; they will be identical when the best loss occurs in the final pass.
        return TrainingSnapshots(
            best_weights=best_weights,
            final_weights=final_weights,
            best_epoch=best_epoch,
            final_epoch=final_epoch,
        )

    return best_weights


# --- Dataset loading --------------------------------------------------------


def _resolve_clip_path(entry: dict, bundle_dir: Path) -> Optional[Path]:
    storage_raw = entry.get("storage")
    storage = storage_raw if isinstance(storage_raw, dict) else {}

    storage_clip = storage.get("clip")
    if isinstance(storage_clip, str):
        resolved_clip = resolve_relative_path(bundle_dir, storage_clip)
        if resolved_clip is not None:
            return resolved_clip

    metadata_raw = entry.get("metadata")
    metadata = metadata_raw if isinstance(metadata_raw, dict) else {}
    clip_filename_raw = metadata.get("clipFilename")
    clip_filename = None
    if isinstance(clip_filename_raw, str):
        candidate_name = clip_filename_raw.strip()
        if candidate_name:
            clip_filename = candidate_name

    storage_files_raw = storage.get("files")
    storage_files: List[str] = []
    if isinstance(storage_files_raw, list):
        for file_entry in storage_files_raw:
            if isinstance(file_entry, str) and file_entry.strip():
                normalized = file_entry.replace("\\", "/").lstrip("/")
                if normalized:
                    storage_files.append(normalized)

    clip_extension = Path(clip_filename).suffix.lower() if clip_filename else ""
    if storage_files:
        found_by_ext: Optional[Path] = None
        found_by_any_video_ext: Optional[Path] = None
        lower_clip_filename = clip_filename.lower() if clip_filename else None

        for relative in storage_files:
            base_name = relative.split("/")[-1]
            if not base_name:
                continue

            candidate_path = resolve_relative_path(bundle_dir, relative)
            if candidate_path is None:
                continue

            lower_base_name = base_name.lower()
            if lower_clip_filename and lower_base_name == lower_clip_filename:
                return candidate_path

            if (
                found_by_ext is None
                and clip_extension
                and lower_base_name.endswith(clip_extension)
            ):
                found_by_ext = candidate_path
                continue

            if (
                found_by_any_video_ext is None
                and Path(relative).suffix.lower() in VIDEO_EXTENSIONS
            ):
                found_by_any_video_ext = candidate_path

        if found_by_ext is not None:
            return found_by_ext
        if found_by_any_video_ext is not None:
            return found_by_any_video_ext

    if clip_filename:
        resolved_by_name = resolve_relative_path(bundle_dir, clip_filename)
        if resolved_by_name is not None:
            return resolved_by_name

    return resolve_relative_path(bundle_dir, "clip.mp4")


def _resolve_still_path(entry: dict, bundle_dir: Path) -> Optional[Path]:
    storage = entry.get("storage", {}) if isinstance(entry, dict) else {}
    if isinstance(storage, dict):
        storage_still = storage.get("still")
        if isinstance(storage_still, str):
            resolved = resolve_relative_path(bundle_dir, storage_still)
            if resolved is not None:
                return resolved

        storage_files = storage.get("files") or []
        metadata = entry.get("metadata", {}) if isinstance(entry.get("metadata"), dict) else {}
        still_filename_raw = metadata.get("stillFilename")
        still_filename = None
        if isinstance(still_filename_raw, str):
            still_filename = still_filename_raw.strip()
            if not still_filename:
                still_filename = None

        still_extension = Path(still_filename).suffix.lower() if still_filename else None
        lower_still_name = still_filename.lower() if still_filename else None

        resolved_by_extension: Optional[Path] = None
        resolved_by_image_ext: Optional[Path] = None

        for relative in storage_files:
            if not isinstance(relative, str):
                continue
            base_name = relative.split("/")[-1]
            if not base_name:
                continue
            candidate = resolve_relative_path(bundle_dir, relative)
            if candidate is None:
                continue

            lower_base = base_name.lower()
            if lower_still_name and lower_base == lower_still_name:
                return candidate

            if (
                resolved_by_extension is None
                and still_extension
                and lower_base.endswith(still_extension)
            ):
                resolved_by_extension = candidate

            if (
                resolved_by_image_ext is None
                and Path(relative).suffix.lower() in IMAGE_EXTENSIONS
            ):
                resolved_by_image_ext = candidate

        if resolved_by_extension is not None:
            return resolved_by_extension
        if resolved_by_image_ext is not None:
            return resolved_by_image_ext

        if still_filename:
            resolved = resolve_relative_path(bundle_dir, still_filename)
            if resolved is not None:
                return resolved

    return resolve_relative_path(bundle_dir, "still.jpg")


def build_samples_from_manifest(manifest_path: Path) -> Tuple[List[Sample], Dict[str, int]]:
    manifest = load_json(manifest_path)
    if not manifest:
        return [], {"entries": 0, "cache_hits": 0, "cache_misses": 0, "cache_writes": 0}

    entries = manifest.get("entries", [])
    data: List[Sample] = []
    cache_hits = 0
    cache_misses = 0
    cache_writes = 0

    for entry in entries:
        label = entry.get("label")
        if not label:
            continue
        profile_id = entry.get("profileId") or entry.get("metadata", {}).get("profileId")
        # Extract handFocus from bundle metadata
        metadata = entry.get("metadata", {}) if isinstance(entry.get("metadata"), dict) else {}
        hand_focus = metadata.get("handFocus")  # 'left', 'right', 'both', or None
        recording_metadata = _extract_recording_metadata(metadata)
        modality_coverage = _extract_modality_coverage(metadata)
        
        # Extract variation data from webapp's SignVariationTracker
        variation_data = metadata.get("variationData", {}) if isinstance(metadata.get("variationData"), dict) else {}
        variation_cluster_id = variation_data.get("clusterId") or variation_data.get("dominantCluster")
        variation_diversity = variation_data.get("variationDiversity")
        canonical_templates_count = variation_data.get("canonicalTemplates")
        
        rel_dir = entry.get("storage", {}).get("directory")
        if not rel_dir:
            continue

        bundle_dir = ensure_inside(DATA_DIR, DATA_DIR / rel_dir)
        landmarks_relative = select_landmarks_relative_path(entry)
        try:
            landmarks_path = ensure_inside(bundle_dir, bundle_dir / Path(landmarks_relative))
        except ValueError:
            continue
        cache_path = bundle_dir / CACHE_FILENAME

        clip_path = _resolve_clip_path(entry, bundle_dir)
        still_path = _resolve_still_path(entry, bundle_dir)

        frames: Optional[List[dict]] = None
        frames_from_clip = False

        cached = load_json(cache_path)
        if cached and isinstance(cached.get("frames"), list):
            frames = cached["frames"]
            cache_hits += 1
        else:
            source = load_json(landmarks_path)
            if source and isinstance(source.get("frames"), list):
                frames = source["frames"]
                cache_misses += 1
            elif clip_path and clip_path.exists():
                frames = extract_landmarks_from_clip(clip_path)
                if frames:
                    frames_from_clip = True
                else:
                    cache_misses += 1
            else:
                cache_misses += 1

        frame_list: List[dict] = list(frames) if frames else []

        # Only extract and append still frame if we're processing from source (not from cache)
        # to avoid doubling the still frame weight when cache already contains it
        if still_path and still_path.exists() and not cached:
            extracted = extract_landmarks_from_still(still_path)
            if extracted:
                # Mark still frame with higher weight since it represents the precise
                # target hand position for this gesture
                extracted["weight"] = STILL_FRAME_WEIGHT
                frame_list.append(extracted)

        timing_stats = _apply_timing_weights(frame_list)
        if frames_from_clip and frame_list:
            cache_writes += 1
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with cache_path.open("w", encoding="utf-8") as handle:
                json.dump({"frames": frame_list}, handle, indent=2)

        if not frame_list:
            continue

        averaged = flatten_landmarks_mean(frame_list)
        if averaged is None:
            continue

        # Apply hand focus filtering to zero out irrelevant hand data
        filtered_landmarks = apply_hand_focus(averaged['landmarks'], hand_focus)

        data.append(Sample(
            label=label,
            profile_id=profile_id,
            landmarks=filtered_landmarks,
            pose_landmarks=averaged.get('poseLandmarks'),
            face_landmarks=averaged.get('faceLandmarks'),
            hand_focus=hand_focus,
            variation_cluster_id=variation_cluster_id,
            variation_diversity=variation_diversity,
            canonical_templates_count=canonical_templates_count,
            recording=recording_metadata,
            timing_stats=timing_stats,
            modality_coverage=modality_coverage,
        ))

    # 2. Process default video examples (global)
    video_examples_dir = DATA_DIR / "dgs_video_examples"
    if video_examples_dir.exists():
        for video_file in video_examples_dir.glob("*.mp4"):
            label = video_file.stem
            # Cache landmarks next to the video file
            video_cache_path = video_examples_dir / f"{label}_landmarks.json"
            
            v_frames: Optional[List[dict]] = None
            if video_cache_path.exists():
                v_cached = load_json(video_cache_path)
                if v_cached and isinstance(v_cached.get("frames"), list):
                    v_frames = v_cached["frames"]
                    cache_hits += 1
            
            if not v_frames:
                LOGGER.info(f"Extracting landmarks from default example: {video_file.name}")
                v_frames = extract_landmarks_from_clip(video_file)
                if v_frames:
                    cache_writes += 1
                    try:
                        with video_cache_path.open("w", encoding="utf-8") as handle:
                            json.dump({"frames": v_frames}, handle, indent=2)
                    except Exception as e:
                        LOGGER.warning(f"Failed to cache landmarks for {video_file.name}: {e}")
                else:
                    cache_misses += 1
            
            if v_frames:
                v_averaged = flatten_landmarks_mean(v_frames)
                if v_averaged:
                    data.append(Sample(
                        label=label,
                        profile_id=None, # Global
                        landmarks=v_averaged['landmarks'],
                        pose_landmarks=v_averaged.get('poseLandmarks'),
                        face_landmarks=v_averaged.get('faceLandmarks')
                    ))

    stats = {
        "entries": len(entries),
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "cache_writes": cache_writes,
    }
    return data, stats


def build_samples_from_legacy_dataset(dataset_path: Path) -> List[Sample]:
    legacy = load_json(dataset_path)
    if not legacy:
        return []
    samples = []
    for entry in legacy.get("samples", []):
        label = entry.get("label") or entry.get("gestureDefinitionId")
        if not label:
            continue
        profile_id = entry.get("profileId")
        landmarks = entry.get("landmarks") or entry.get("landmarkData")
        if not landmarks:
            continue
        samples.append(Sample(label=label, profile_id=profile_id, landmarks=landmarks))
    return samples


def dataset_to_arrays(
    samples: List[Sample],
    *,
    augmentations_per_sample: int = 0,
    rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None,
) -> Tuple[np.ndarray, np.ndarray, List[str], np.ndarray]:
    label_set = sorted({sample.label for sample in samples})
    label_to_idx = {label: idx for idx, label in enumerate(label_set)}

    X_list: List[np.ndarray] = []
    y_list: List[int] = []
    weight_list: List[float] = []

    # Check if any samples have multimodal data
    has_multimodal = any(s.pose_landmarks or s.face_landmarks for s in samples)
    
    augmentations = max(0, int(augmentations_per_sample))
    for sample in samples:
        # Use multimodal normalization if available, fall back to hand-only
        if has_multimodal:
            normalized = _normalize_multimodal(sample)
        else:
            normalized = _normalize(sample.landmarks)
            
        if normalized is None:
            continue

        normalized_array = normalized.astype(np.float32, copy=False)
        X_list.append(normalized_array)
        y_list.append(label_to_idx[sample.label])
        weight_list.append(_compute_quality_weight(sample))

        for _ in range(augmentations):
            # Apply appropriate augmentation based on data type
            if has_multimodal:
                augmented = augment_multimodal_landmarks(normalized_array, rng=rng)
            else:
                augmented = augment_landmarks(normalized_array, rng=rng)
            X_list.append(augmented)
            y_list.append(label_to_idx[sample.label])
            weight_list.append(_compute_quality_weight(sample))

    if not X_list:
        # Feature size depends on whether we have multimodal data
        feature_size = 258 if has_multimodal else 126  # 126 hand + 99 pose + 33 face
        return (
            np.zeros((0, feature_size), dtype=np.float32),
            np.zeros((0,), dtype=np.int64),
            label_set,
            np.zeros((0,), dtype=np.float32),
        )

    X = np.vstack(X_list)
    y = np.array(y_list, dtype=np.int64)
    return X, y, label_set, np.array(weight_list, dtype=np.float32)


def validate_samples(samples: List[Sample]) -> None:
    if not samples:
        LOGGER.warning("Keine Trainingsdaten gefunden - Training wird übersprungen.")
        return

    label_counts: Dict[str, int] = {}
    profile_counts: Dict[str, Dict[str, int]] = {}

    for sample in samples:
        label_counts[sample.label] = label_counts.get(sample.label, 0) + 1
        if sample.profile_id:
            profile_map = profile_counts.setdefault(sample.profile_id, {})
            profile_map[sample.label] = profile_map.get(sample.label, 0) + 1

    low_labels = [label for label, count in label_counts.items() if count < MIN_SAMPLES_PER_LABEL]
    if low_labels and MIN_SAMPLES_PER_LABEL > 1:
        raise ValueError(
            "Zu wenige Beispiele pro Geste: "
            + ", ".join(f"{label} ({label_counts[label]})" for label in sorted(low_labels))
        )

    for profile_id, counts in profile_counts.items():
        short_labels = [label for label, count in counts.items() if count < MIN_SAMPLES_PER_PROFILE]
        if short_labels and MIN_SAMPLES_PER_PROFILE > 1:
            raise ValueError(
                f"Profil {profile_id} hat zu wenige Beispiele: "
                + ", ".join(f"{label} ({counts[label]})" for label in sorted(short_labels))
            )


def compute_sample_weights(y: np.ndarray, *, smoothing: float = 0.0) -> np.ndarray:
    """Return per-sample weights using inverse frequency with optional smoothing."""

    if y.size == 0:
        return np.zeros((0,), dtype=np.float32)

    if smoothing < 0:
        raise ValueError(f"smoothing must be non-negative, got {smoothing}")

    labels = np.asarray(y, dtype=np.int64)
    class_counts = np.bincount(labels)
    adjusted = class_counts + float(smoothing)
    inv_freq = np.where(adjusted > 0, 1.0 / adjusted, 0.0)

    weights = inv_freq[labels].astype(np.float32)
    weight_sum = float(np.sum(weights))
    if weight_sum > 0:
        weights *= float(len(weights)) / weight_sum

    return weights


def plan_train_validation_split(
    X: np.ndarray,
    *,
    validation_fraction: float,
    rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """Return shuffled train/validation indices ensuring training retains samples.

    Parameters
    ----------
    X:
        Feature matrix for which the split should be planned. Only the first
        dimension (number of samples) is inspected.
    validation_fraction:
        Desired fraction of samples to reserve for validation. The training
        portion is guaranteed to contain at least one sample when ``X`` is not
        empty. Fractions outside ``[0, 1]`` are clamped to that range.
    rng:
        Optional random number generator used to shuffle indices deterministically
        in tests.
    """

    num_samples = int(X.shape[0])
    if num_samples == 0:
        empty = np.zeros((0,), dtype=np.int64)
        return empty, empty

    indices = np.arange(num_samples, dtype=np.int64)

    if rng is None:
        np.random.shuffle(indices)
    elif hasattr(rng, "permutation"):
        indices = np.asarray(rng.permutation(num_samples), dtype=np.int64)
    elif hasattr(rng, "shuffle"):
        rng.shuffle(indices)
    else:
        raise TypeError("The provided 'rng' object must have a 'permutation' or 'shuffle' method.")

    if num_samples < 2:
        return indices, np.zeros((0,), dtype=np.int64)

    sanitized_fraction = float(np.clip(validation_fraction, 0.0, 1.0))
    validation_count = int(num_samples * sanitized_fraction)
    if validation_count >= num_samples:
        validation_count = num_samples - 1

    train_count = num_samples - validation_count

    train_indices = indices[:train_count]
    validation_indices = indices[train_count:]
    return train_indices, validation_indices


def save_model(path: Path, weights: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray], labels: List[str]):
    w1, b1, w2, b2 = weights
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("wb") as handle:
        np.savez(
            handle,
            w1=np.array(w1.T, order="C"),
            b1=b1,
            w2=np.array(w2.T, order="C"),
            b2=b2,
            labels=np.array(labels),
        )
    os.replace(tmp_path, path)
    try:
        os.chmod(path, 0o640)
    except OSError:
        pass


def _compute_accuracy(
    X: np.ndarray, y: np.ndarray, weights: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]
) -> float:
    if X.size == 0 or y.size == 0:
        return 0.0

    w1, b1, w2, b2 = weights
    probs = _forward(X, w1, b1, w2, b2)
    preds = np.argmax(probs, axis=1)
    return float(np.mean(preds == y)) if len(y) else 0.0


def train_models(
    samples: List[Sample],
    *,
    config: Optional[TrainingConfig] = None,
    rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None,
) -> Tuple[Dict[str, dict], dict]:
    """Train global and per-profile models. Returns (profiles_report, global_report)."""

    resolved_config = config or TrainingConfig()
    trainer_config = replace(resolved_config, return_best_and_final=True)

    global_report = {"samples": 0, "accuracy": 0.0, "labels": {}}
    profiles_report: Dict[str, dict] = {}

    if not samples:
        return profiles_report, global_report

    # Filter for global samples (no profile_id) to prevent data leakage between users
    global_samples = [s for s in samples if not s.profile_id]

    if global_samples:
        X, y, labels, quality_weights = dataset_to_arrays(
            global_samples,
            augmentations_per_sample=resolved_config.augmentations_per_sample,
            rng=rng,
        )

        if X.shape[0] > 0:
            train_indices, validation_indices = plan_train_validation_split(
                X, validation_fraction=resolved_config.validation_fraction, rng=rng
            )

            X_train, y_train = X[train_indices], y[train_indices]
            X_val, y_val = X[validation_indices], y[validation_indices]

            train_quality = quality_weights[train_indices] if quality_weights.size else None
            val_quality = quality_weights[validation_indices] if quality_weights.size else None

            train_class_weights = (
                compute_sample_weights(y_train, smoothing=resolved_config.class_weight_smoothing)
                if y_train.size
                else None
            )
            val_class_weights = (
                compute_sample_weights(y_val, smoothing=resolved_config.class_weight_smoothing)
                if y_val.size
                else None
            )

            train_weights = train_class_weights
            if train_quality is not None and train_quality.size:
                train_weights = train_quality if train_weights is None else train_weights * train_quality

            val_weights = val_class_weights
            if val_quality is not None and val_quality.size:
                val_weights = val_quality if val_weights is None else val_weights * val_quality

            snapshot = train_mlp(
                X_train,
                y_train,
                len(labels),
                config=trainer_config,
                sample_weights=train_weights,
                validation_data=(X_val, y_val) if X_val.size else None,
                validation_sample_weights=val_weights,
                rng=rng,
            )

            best_weights = snapshot.best_weights if isinstance(snapshot, TrainingSnapshots) else snapshot

            train_acc = _compute_accuracy(X_train, y_train, best_weights)
            val_acc = _compute_accuracy(X_val, y_val, best_weights)

            save_model(GLOBAL_MODEL_PATH, best_weights, labels)
            global_report = {
                "samples": int(X.shape[0]),
                "accuracy": train_acc,
                "validationSamples": int(X_val.shape[0]),
                "validationAccuracy": val_acc,
                "labels": {label: int(sum(1 for sample in global_samples if sample.label == label)) for label in labels},
                "recordingStats": _summarize_recording_stats(global_samples),
                "modelPath": os.path.relpath(GLOBAL_MODEL_PATH, DATA_DIR),
            }

    profiles = sorted({s.profile_id for s in samples if s.profile_id})
    for pid in profiles:
        subset = filter_samples_by_profile(samples, pid)
        if not subset:
            continue
        Xp, yp, labels_p, quality_weights_p = dataset_to_arrays(
            subset,
            augmentations_per_sample=resolved_config.augmentations_per_sample,
            rng=rng,
        )
        if Xp.shape[0] == 0:
            continue

        train_idx_p, val_idx_p = plan_train_validation_split(
            Xp, validation_fraction=resolved_config.validation_fraction, rng=rng
        )

        Xp_train, yp_train = Xp[train_idx_p], yp[train_idx_p]
        Xp_val, yp_val = Xp[val_idx_p], yp[val_idx_p]

        train_quality_p = quality_weights_p[train_idx_p] if quality_weights_p.size else None
        val_quality_p = quality_weights_p[val_idx_p] if quality_weights_p.size else None

        train_class_weights_p = (
            compute_sample_weights(
                yp_train, smoothing=resolved_config.class_weight_smoothing
            )
            if yp_train.size
            else None
        )
        val_class_weights_p = (
            compute_sample_weights(yp_val, smoothing=resolved_config.class_weight_smoothing)
            if yp_val.size
            else None
        )

        train_weights_p = train_class_weights_p
        if train_quality_p is not None and train_quality_p.size:
            train_weights_p = train_quality_p if train_weights_p is None else train_weights_p * train_quality_p

        val_weights_p = val_class_weights_p
        if val_quality_p is not None and val_quality_p.size:
            val_weights_p = val_quality_p if val_weights_p is None else val_weights_p * val_quality_p

        snapshot_p = train_mlp(
            Xp_train,
            yp_train,
            len(labels_p),
            config=trainer_config,
            sample_weights=train_weights_p,
            validation_data=(Xp_val, yp_val) if Xp_val.size else None,
            validation_sample_weights=val_weights_p,
            rng=rng,
        )

        weights_p = snapshot_p.best_weights if isinstance(snapshot_p, TrainingSnapshots) else snapshot_p
        acc_p = _compute_accuracy(Xp_train, yp_train, weights_p)
        val_acc_p = _compute_accuracy(Xp_val, yp_val, weights_p)
        profile_path = MODELS_DIR / pid / "amy_model.npz"
        save_model(profile_path, weights_p, labels_p)
        profiles_report[pid] = {
            "samples": int(Xp.shape[0]),
            "accuracy": acc_p,
            "validationSamples": int(Xp_val.shape[0]),
            "validationAccuracy": val_acc_p,
            "labels": {label: int(sum(1 for sample in subset if sample.label == label)) for label in labels_p},
            "recordingStats": _summarize_recording_stats(subset),
            "modelPath": os.path.relpath(profile_path, DATA_DIR),
        }

    return profiles_report, global_report


def persist_training_metadata(payload: Dict[str, object]) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    metadata_path = MODELS_DIR / "training_metadata.json"
    tmp_path = metadata_path.with_suffix(".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    os.replace(tmp_path, metadata_path)


# --- Entry point ------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="Train Amy's MLP from manifest bundles")
    parser.add_argument("--manifest", type=str, default=str(MANIFEST_PATH))
    parser.add_argument("--data-dir", type=str, default=str(DATA_DIR))
    args = parser.parse_args()

    try:
        manifest_path = ensure_inside(Path(args.data_dir), Path(args.manifest))
        start_ts = datetime.now(timezone.utc)

        samples, stats = build_samples_from_manifest(manifest_path)
        if not samples:
            legacy_samples = build_samples_from_legacy_dataset(LEGACY_DATASET_PATH)
            samples = legacy_samples
            stats["legacy_samples"] = len(legacy_samples)

        validate_samples(samples)
        profiles_report, global_report = train_models(samples)

        finished_at = datetime.now(timezone.utc)
        report = {
            "generatedAt": finished_at.isoformat().replace("+00:00", "Z"),
            "manifestPath": os.path.relpath(manifest_path, Path(args.data_dir)),
            "cache": stats,
            "global": global_report,
            "profiles": profiles_report,
            "totalSamples": len(samples),
            "dependencies": {"mediapipe": mp is not None, "opencv": cv2 is not None},
            "durationMs": int((finished_at - start_ts).total_seconds() * 1000),
        }

        metadata = {
            "manifestSha256": sha256_file(manifest_path),
            "hyperparameters": {
                "hiddenSize": HIDDEN_SIZE,
                "learningRate": LEARNING_RATE,
                "epochs": EPOCHS,
                "dropoutRate": DROPOUT_RATE,
                "validationFraction": VALIDATION_FRACTION,
                "augmentationsPerSample": AUGMENTATIONS_PER_SAMPLE,
                "classWeightSmoothing": CLASS_WEIGHT_SMOOTHING,
                "earlyStoppingPatience": EARLY_STOPPING_PATIENCE,
                "earlyStoppingMinDelta": EARLY_STOPPING_MIN_DELTA,
            },
            "dependencies": {"mediapipe": mp is not None, "opencv": cv2 is not None},
            "generatedAt": report["generatedAt"],
            "samples": len(samples),
            "profiles": list(profiles_report.keys()),
            "durationMs": report["durationMs"],
        }
        persist_training_metadata(metadata)

        print(json.dumps(report))
        return 0
    except DependencyUnavailableError as err:
        print(str(err), file=sys.stderr)
        return 2
    except ValueError as err:
        print(f"Training abgebrochen: {err}", file=sys.stderr)
        return 1
    except Exception:  # pragma: no cover - defensive fallback
        LOGGER.exception("Unhandled training error")
        return 1


if __name__ == "__main__":
    sys.exit(main())
