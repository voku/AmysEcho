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

# --- Temporal Window Configuration ---
WINDOW_SIZE = 30  # Fixed window size for temporal context (1 second at 30fps)
INPUT_FEATURE_SIZE = 1629  # 126 (Hands) + 99 (Pose) + 1404 (Face)
WINDOW_FEATURE_SIZE = INPUT_FEATURE_SIZE * WINDOW_SIZE  # 48,870 features

# --- MLP Architecture Constants ---
MLP_LAYER1_SIZE = 512   # First hidden layer (funnel entrance)
MLP_LAYER2_SIZE = 256   # Second hidden layer (funnel middle)
# Output layer size is dynamic (number of classes)

# --- Density-Balanced Priority Factors ---
# These prevent high-dimensional modalities from drowning out critical features
HAND_PRIORITY_FACTOR = 3.0   # Hands are most critical for sign language
POSE_PRIORITY_FACTOR = 0.4   # Body posture provides context
FACE_PRIORITY_FACTOR = 0.1   # Facial expressions are supplementary

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

# --- Legacy Configuration (Deprecated but kept for reference) ---
# HIDDEN_SIZE: No longer used (hardcoded to 1024/512)
# The old 2-layer architecture has been replaced with 3-layer funnel

# --- New Recommended Hyperparameters ---
LEARNING_RATE = float(os.environ.get("MLP_LEARNING_RATE", "0.005"))  # Reduced for deeper network
DROPOUT_RATE = max(0.0, min(1.0, float(os.environ.get("MLP_DROPOUT_RATE", "0.3"))))  # Increased for regularization
EPOCHS = int(os.environ.get("MLP_EPOCHS", "1000"))  # Increased for convergence

MAX_FRAMES_PER_CLIP = int(os.environ.get("MLP_MAX_FRAMES", "120"))
FRAME_STRIDE = int(os.environ.get("MLP_FRAME_STRIDE", "2"))
VALIDATION_FRACTION = float(os.environ.get("MLP_VALIDATION_FRACTION", "0.15"))
# Augmentation via frame replication (disabled in favor of sliding windows)
AUGMENTATIONS_PER_SAMPLE = 0  # Set to 0 - overlapping windows provide augmentation

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

WeightTuple = Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]

def _emit_event(payload: Dict[str, object]) -> None:
    """Log a structured progress event."""

    message = json.dumps(payload)
    print(message, file=sys.stderr, flush=True)
    LOGGER.info(message)

# --- Data structures --------------------------------------------------------

@dataclass
class Sample:
    """Training sample produced from a bundle. 
    
    In temporal sliding window mode, `landmarks` contains the flattened
    feature vector for the entire window (30 frames * 1629 features).
    """

    label: str
    profile_id: Optional[str]
    landmarks: List[float]  # Flattened window vector (48,870 floats)
    pose_landmarks: Optional[List[List[float]]] = None  # Legacy / Embedded
    face_landmarks: Optional[List[List[float]]] = None  # Legacy / Embedded
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

    hidden_size: int = MLP_LAYER1_SIZE # Deprecated but kept for compat
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
    if isinstance(hands_cov, (int, float)):
        if hands_cov < MIN_HANDS_COVERAGE:
            weight *= 0.4  # More aggressive penalty for children's signs (hands are critical)
        elif hands_cov > 0.9:  # Bonus for excellent hand coverage
            weight *= 1.2
    pose_cov = coverage.get("pose")
    if isinstance(pose_cov, (int, float)) and pose_cov < MIN_POSE_COVERAGE:
        weight *= 0.95  # Reduced penalty - pose less critical for children's signs
    face_cov = coverage.get("face")
    if isinstance(face_cov, (int, float)) and face_cov < MIN_FACE_COVERAGE:
        weight *= 0.98  # Minimal penalty - face least critical for signing

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

    try:
        # Try modern Tasks API (highly robust for new MP versions)
        if mp_tasks and mp_vision:
            models_dir = Path(__file__).resolve().parents[2] / "data" / "models"
            if not models_dir.exists():
                models_dir = Path("server/data/models")
            
            hand_model = models_dir / "hand_landmarker.task"
            pose_model = models_dir / "pose_landmarker.task"
            face_model = models_dir / "face_landmarker.task"
            
            # Scenario 1: Full Multimodal (All models available)
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
                except Exception as e:
                    print(f"warning: Multimodal Tasks API failed: {e}", file=sys.stderr)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0) # Reset video for fallback
                else:
                    return frames
            
            # Scenario 2: Hands-only fallback (Only hand model available OR multimodal failed)
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
                except Exception as e:
                    print(f"warning: Hands-only Tasks API failed: {e}", file=sys.stderr)
                else:
                    return frames
    finally:
        cap.release()
    
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


def _normalize_frame(
    landmarks: Optional[List[List[float]]], 
    pose_landmarks: Optional[List[List[float]]], 
    face_landmarks: Optional[List[List[float]]]
) -> Optional[np.ndarray]:
    """
    Normalize a single frame into a 1629-dimensional feature vector.
    
    This function processes one temporal instant and applies scale/translation
    invariance separately to each modality (hands, pose, face).
    
    Returns:
        np.ndarray: Normalized feature vector [126 + 99 + 1404 = 1629 features]
        None: If mandatory hand landmarks are missing or invalid
    """
    
    # ========== 1. HAND LANDMARKS (MANDATORY) - 126 Features ========== 
    if not landmarks or len(landmarks) < 21:
        return None  # Hands are required for sign language

    # Handle flat list or list of lists
    if isinstance(landmarks[0], (int, float)):
        pts = np.array(landmarks, dtype=np.float32).reshape(-1, 3)
        LOGGER.debug("Received flat landmark list; reshaped to (N, 3)")
    else:
        pts = np.array(landmarks, dtype=np.float32)
    
    # Ensure we have 42 points (21 left + 21 right)
    if pts.shape[0] < 42:
        pad = np.zeros((42 - pts.shape[0], 3), dtype=np.float32)
        pts = np.vstack([pts, pad])
    else:
        pts = pts[:42]  # Truncate if extra points

    def _normalize_hand(hand_points: np.ndarray) -> np.ndarray:
        """Center on wrist and scale by maximum extension."""
        wrist = hand_points[0]
        centered = hand_points - wrist
        
        # Scale by L1 norm (sum of absolute coordinates)
        max_dist = np.max(np.sum(np.abs(centered), axis=1))
        if max_dist < 1e-8:
            return centered  # Avoid division by zero
        return centered / max_dist

    left_hand = _normalize_hand(pts[:21])
    right_hand = _normalize_hand(pts[21:])
    
    # Apply priority weighting and flatten
    hand_features = np.concatenate([left_hand, right_hand]).flatten() * HAND_PRIORITY_FACTOR

    # ========== 2. POSE LANDMARKS (OPTIONAL) - 99 Features ========== 
    if pose_landmarks and len(pose_landmarks) >= 33:
        pose_arr = np.array(pose_landmarks, dtype=np.float32)[:33, :3]  # x,y,z only (drop visibility)
        
        # Normalize to torso center (midpoint of shoulders 11,12 and hips 23,24)
        torso_indices = [11, 12, 23, 24]
        torso_center = np.mean(pose_arr[torso_indices], axis=0)
        pose_centered = pose_arr - torso_center
        
        # Scale by shoulder width for size invariance
        shoulder_dist = np.linalg.norm(pose_arr[11] - pose_arr[12])
        if shoulder_dist > 1e-6:
            pose_centered /= shoulder_dist
        
        pose_features = pose_centered.flatten() * POSE_PRIORITY_FACTOR
    else:
        # Fill with zeros if pose data unavailable (modality dropout)
        pose_features = np.zeros(99, dtype=np.float32)

    # ========== 3. FACE LANDMARKS (OPTIONAL) - 1404 Features ========== 
    if face_landmarks and len(face_landmarks) >= 468:
        face_arr = np.array(face_landmarks, dtype=np.float32)[:468, :3]
        
        # Center on nose tip (landmark index 1)
        nose = face_arr[1]
        face_centered = face_arr - nose
        
        # Scale by eye distance (landmarks 33 to 263)
        eye_dist = np.linalg.norm(face_arr[33] - face_arr[263])
        if eye_dist > 1e-6:
            face_centered /= eye_dist
        
        face_features = face_centered.flatten() * FACE_PRIORITY_FACTOR
    else:
        # Fill with zeros if face data unavailable
        face_features = np.zeros(1404, dtype=np.float32)

    # ========== CONCATENATE ALL MODALITIES ========== 
    return np.concatenate([hand_features, pose_features, face_features])


def create_sliding_windows(
    frame_vectors: List[np.ndarray], 
    label: str, 
    context: dict
) -> List[Sample]:
    """
    Convert a sequence of normalized frame vectors into sliding window training samples.
    
    Strategy:
    - Padding: Edge replication (repeat last frame) for clips shorter than WINDOW_SIZE
    - Stride: 1 frame (generates overlapping windows for data augmentation)
    - Output: Each Sample.landmarks contains a flattened (WINDOW_SIZE * 1629) vector
    
    Args:
        frame_vectors: List of (1629,) normalized frame vectors
        label: Class label for these windows (or "_NULL_" for background)
        context: Metadata dictionary (profile_id, hand_focus, etc.)
    
    Returns:
        List of Sample objects with temporal window features
    """
    if not frame_vectors:
        return []

    # Convert to array for efficient slicing
    arr = np.array(frame_vectors, dtype=np.float32)  # Shape: (T, 1629)
    seq_len, _ = arr.shape

    # Validate feature dimension
    if arr.shape[1] != INPUT_FEATURE_SIZE:
        raise ValueError(
            f"Expected frame vectors of size {INPUT_FEATURE_SIZE}, got {arr.shape[1]}"
        )

    # ========== PADDING FOR SHORT CLIPS ========== 
    if seq_len < WINDOW_SIZE:
        pad_qty = WINDOW_SIZE - seq_len
        last_frame = arr[-1:, :]  # Keep 2D shape for vstack
        
        # Repeat last frame (edge padding preserves final hand position)
        padding = np.repeat(last_frame, pad_qty, axis=0)
        arr = np.vstack([arr, padding])
        seq_len = WINDOW_SIZE

    # ========== GENERATE SLIDING WINDOWS ========== 
    samples = []
    num_windows = seq_len - WINDOW_SIZE + 1  # Overlapping windows with stride=1
    
    for i in range(num_windows):
        # Extract window: (WINDOW_SIZE, 1629)
        window = arr[i : i + WINDOW_SIZE, :]
        
        # Flatten to super-vector: (48870,)
        flat_vector = window.flatten().tolist()
        
        # Create Sample with temporal features
        samples.append(Sample(
            label=label,
            profile_id=context.get('profile_id'),
            landmarks=flat_vector,  # Contains full temporal window
            pose_landmarks=None,    # Now embedded in landmarks
            face_landmarks=None,    # Now embedded in landmarks
            hand_focus=context.get('hand_focus'),
            variation_cluster_id=context.get('variation_cluster_id'),
            variation_diversity=context.get('variation_diversity'),
            canonical_templates_count=context.get('canonical_templates_count'),
            recording=context.get('recording'),
            timing_stats=context.get('timing_stats'),
            modality_coverage=context.get('modality_coverage')
        ))
    
    return samples



# --- MLP implementation (unchanged core) ------------------------------------


def relu(x):
    return np.maximum(0, x)


def relu_derivative(x):
    return np.where(x > 0, 1, 0)


def softmax(x):
    e_x = np.exp(x - np.max(x, axis=1, keepdims=True))
    return e_x / np.sum(e_x, axis=1, keepdims=True)


def _forward_mlp(
    X: np.ndarray,
    w1: np.ndarray, b1: np.ndarray,
    w2: np.ndarray, b2: np.ndarray,
    w3: np.ndarray, b3: np.ndarray,
    dropout_mask1: Optional[np.ndarray] = None,
    dropout_mask2: Optional[np.ndarray] = None
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Three-layer MLP forward pass with optional dropout. 
    
    Architecture: Input(48870) → 512 → 256 → Output(num_classes)
    
    Returns:
        probs: Softmax probabilities (N, num_classes)
        a1: Layer 1 activations (N, 512)
        a2: Layer 2 activations (N, 256)
        z1: Layer 1 pre-activation (needed for backprop)
        z2: Layer 2 pre-activation (needed for backprop)
    """
    # Layer 1: Input → 512
    z1 = np.dot(X, w1) + b1
    a1 = relu(z1)
    if dropout_mask1 is not None:
        a1 *= dropout_mask1
    
    # Layer 2: 512 → 256
    z2 = np.dot(a1, w2) + b2
    a2 = relu(z2)
    if dropout_mask2 is not None:
        a2 *= dropout_mask2
    
    # Layer 3: 512 → Output (logits)
    z3 = np.dot(a2, w3) + b3
    probs = softmax(z3)
    
    return probs, a1, a2, z1, z2


def train_mlp(
    X: np.ndarray,
    y: np.ndarray,
    output_size: int,
    *,
    config: Optional[TrainingConfig] = None,
    hidden_size: Optional[int] = _UNSET,  # Deprecated (hardcoded to 1024/512)
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
    """
    Train a 3-layer MLP using mini-batch gradient descent.
    
    Returns:
        Tuple of (w1, b1, w2, b2, w3, b3) - best weights from training
    """
    import warnings

    if hidden_size is not _UNSET:
        warnings.warn(
            "The 'hidden_size' parameter is deprecated and ignored. "
            "Layer sizes are now controlled by MLP_LAYER1_SIZE and MLP_LAYER2_SIZE constants.",
            DeprecationWarning,
            stacklevel=2
        )
    
    # Resolve configuration
    resolved = config or TrainingConfig()
    overrides = {
        field: value
        for field, value in {
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

    epochs = resolved.epochs
    learning_rate = resolved.learning_rate
    dropout_rate = resolved.dropout_rate
    early_stopping_patience = resolved.early_stopping_patience
    early_stopping_min_delta = resolved.early_stopping_min_delta
    return_best_and_final_flag = resolved.return_best_and_final

    # ========== ARCHITECTURE DEFINITION ========== 
    input_dim = X.shape[1]  # Should be 48,870 (WINDOW_SIZE * INPUT_FEATURE_SIZE)
    layer1_size = MLP_LAYER1_SIZE  # 512
    layer2_size = MLP_LAYER2_SIZE  # 256
    
    if input_dim != WINDOW_FEATURE_SIZE:
        LOGGER.warning(
            f"Input dimension {input_dim} does not match WINDOW_FEATURE_SIZE {WINDOW_FEATURE_SIZE}. "
            "This is expected in unit tests but may indicate a configuration error in production."
        )

    # ========== WEIGHT INITIALIZATION (He Initialization) ========== 
    random_source = np.random if rng is None else rng
    
    def _sample_from_rng(rs, shape):
        """Helper to handle different RNG types."""
        if isinstance(rs, (np.random.Generator, np.random.RandomState)):
            # Generator uses 'standard_normal', RandomState uses 'standard_normal' too
            # but RandomState.standard_normal takes 'size' as kwarg or first arg
            return rs.standard_normal(size=shape)
        if hasattr(rs, "randn"):
            return rs.randn(*shape)
        return np.random.standard_normal(size=shape)

    def _uniform_from_rng(rs, shape):
        """Helper for uniform [0, 1) sampling across RNG types."""
        if isinstance(rs, (np.random.Generator, np.random.RandomState)):
            if hasattr(rs, "random"):
                return rs.random(size=shape)
            return rs.random_sample(size=shape)
        if hasattr(rs, "rand"):
            return rs.rand(*shape)
        return np.random.random(size=shape)
    
    # He initialization: scale = sqrt(2 / fan_in)
    scale1 = np.sqrt(2.0 / input_dim)
    w1 = _sample_from_rng(random_source, (input_dim, layer1_size)).astype(np.float32) * scale1
    b1 = np.zeros(layer1_size, dtype=np.float32)
    
    scale2 = np.sqrt(2.0 / layer1_size)
    w2 = _sample_from_rng(random_source, (layer1_size, layer2_size)).astype(np.float32) * scale2
    b2 = np.zeros(layer2_size, dtype=np.float32)
    
    scale3 = np.sqrt(2.0 / layer2_size)
    w3 = _sample_from_rng(random_source, (layer2_size, output_size)).astype(np.float32) * scale3
    b3 = np.zeros(output_size, dtype=np.float32)

    # ========== TRAINING SETUP ========== 
    num_samples = X.shape[0]
    sanitized_dropout = max(0.0, min(1.0, dropout_rate))
    keep_prob = 1.0 - sanitized_dropout
    use_dropout = keep_prob < 1.0

    # Weighted loss handling
    train_weights = None
    train_weight_sum = float(num_samples)
    if sample_weights is not None:
        candidate = np.asarray(sample_weights, dtype=np.float32)
        if candidate.shape[0] == num_samples and candidate.size > 0:
            weight_sum = float(np.sum(candidate))
            if weight_sum > 0:
                train_weights = candidate
                train_weight_sum = weight_sum

    # Validation data
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

    # Early stopping
    best_loss = math.inf
    best_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy(), w3.copy(), b3.copy())
    epochs_without_improvement = 0
    patience_enabled = (early_stopping_patience is not None and early_stopping_patience > 0)
    min_delta = max(0.0, early_stopping_min_delta)
    best_epoch = 0
    final_epoch = 0

    # ========== TRAINING LOOP ========== 
    for epoch in range(epochs):
        current_epoch = epoch + 1
        
        # 1. Generate dropout masks
        dropout_mask1 = None
        dropout_mask2 = None
        if use_dropout:
            mask1 = (
                _uniform_from_rng(random_source, (num_samples, layer1_size)) < keep_prob
            ).astype(np.float32)
            mask2 = (
                _uniform_from_rng(random_source, (num_samples, layer2_size)) < keep_prob
            ).astype(np.float32)
            if keep_prob > 0.0:
                mask1 /= keep_prob
                mask2 /= keep_prob
            dropout_mask1 = mask1
            dropout_mask2 = mask2

        # 2. Forward pass
        probs, a1, a2, z1, z2 = _forward_mlp(
            X, w1, b1, w2, b2, w3, b3, 
            dropout_mask1, dropout_mask2
        )

        # 3. Compute training loss (cross-entropy)
        p = np.clip(probs[np.arange(num_samples), y], LOSS_EPSILON, 1.0 - LOSS_EPSILON)
        log_probs = -np.log(p)
        if train_weights is not None:
            loss = float(np.sum(log_probs * train_weights) / train_weight_sum)
        else:
            loss = float(np.sum(log_probs) / num_samples)

        # 4. Compute validation loss (if available)
        validation_loss = None
        if validation_X is not None and validation_y is not None and validation_X.size:
            val_probs, _, _, _, _ = _forward_mlp(
                validation_X, w1, b1, w2, b2, w3, b3
            )
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

        # 5. Progress logging
        monitor_loss = validation_loss if validation_loss is not None else loss
        if epoch % max(1, epochs // 10) == 0:
            _emit_event(
                {
                    "type": "progress",
                    "epoch": current_epoch,
                    "total": epochs,
                    "loss": f"{loss:.4f}",
                    **({"validationLoss": f"{validation_loss:.4f}"} if validation_loss is not None else {}),
                }
            )

        # 6. Early stopping check
        stop_after_epoch = False
        if monitor_loss < best_loss - min_delta:
            best_loss = monitor_loss
            best_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy(), w3.copy(), b3.copy())
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

        # ========== BACKPROPAGATION (CHAIN RULE) ========== 
        
        # Output layer gradient
        dz3 = probs.copy()
        dz3[np.arange(num_samples), y] -= 1
        if train_weights is not None:
            dz3 *= (train_weights / train_weight_sum)[:, None]
        else:
            dz3 /= num_samples

        # Layer 3 gradients (512 → Output)
        dw3 = np.dot(a2.T, dz3)
        db3 = np.sum(dz3, axis=0)

        # Layer 2 gradients (1024 → 512)
        da2 = np.dot(dz3, w3.T)
        if dropout_mask2 is not None:
            da2 *= dropout_mask2
        dz2 = da2 * relu_derivative(z2)
        dw2 = np.dot(a1.T, dz2)
        db2 = np.sum(dz2, axis=0)

        # Layer 1 gradients (Input → 1024)
        da1 = np.dot(dz2, w2.T)
        if dropout_mask1 is not None:
            da1 *= dropout_mask1
        dz1 = da1 * relu_derivative(z1)
        dw1 = np.dot(X.T, dz1)
        db1 = np.sum(dz1, axis=0)

        # ========== GRADIENT DESCENT UPDATE ========== 
        w1 -= learning_rate * dw1
        b1 -= learning_rate * db1
        w2 -= learning_rate * dw2
        b2 -= learning_rate * db2
        w3 -= learning_rate * dw3
        b3 -= learning_rate * db3

        final_epoch = current_epoch

        if stop_after_epoch:
            break

    # ========== RETURN BEST WEIGHTS ========== 
    final_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy(), w3.copy(), b3.copy())

    if return_best_and_final_flag:
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
    """
    Load training data from manifest and generate sliding window samples.
    
    Key Changes from Baseline:
    - Removed frame averaging logic entirely
    - Each clip generates multiple training samples (sliding windows)
    - Automatically creates "_NULL_" class from clip starts (background modeling)
    """
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
        metadata = entry.get("metadata", {}) if isinstance(entry.get("metadata"), dict) else {}
        hand_focus = metadata.get("handFocus")
        
        # Extract variation tracking data
        variation_data = metadata.get("variationData", {}) if isinstance(metadata.get("variationData"), dict) else {}
        variation_cluster_id = variation_data.get("clusterId") or variation_data.get("dominantCluster")
        variation_diversity = variation_data.get("variationDiversity")
        canonical_templates_count = variation_data.get("canonicalTemplates")
        
        recording_metadata = _extract_recording_metadata(metadata)
        modality_coverage = _extract_modality_coverage(metadata)
        
        # ========== PATH RESOLUTION (keep existing logic) ========== 
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

        # ========== LOAD FRAMES (with caching) ========== 
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

        # Add still frame if available (only when not cached to avoid duplication)
        if still_path and still_path.exists() and not cached:
            extracted = extract_landmarks_from_still(still_path)
            if extracted:
                extracted["weight"] = STILL_FRAME_WEIGHT
                frame_list.append(extracted)

        timing_stats = _apply_timing_weights(frame_list)
        
        # Cache newly extracted frames
        if frames_from_clip and frame_list:
            cache_writes += 1
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with cache_path.open("w", encoding="utf-8") as handle:
                json.dump({"frames": frame_list}, handle, indent=2)

        if not frame_list:
            continue

        # ========== NEW SLIDING WINDOW PROCESSING ========== 
        
        # 1. Normalize each frame individually
        normalized_frames = []
        for f in frame_list:
            lms = f.get("landmarks")
            pose = f.get("poseLandmarks")
            face = f.get("faceLandmarks")
            
            # Apply hand focus filtering if specified
            if hand_focus and lms:
                lms = apply_hand_focus(lms, hand_focus, f.get("handedness"))
            
            # Normalize to (1629,) vector
            vec = _normalize_frame(lms, pose, face)
            if vec is not None:
                normalized_frames.append(vec)
        
        if not normalized_frames:
            continue

        # 2. Build metadata context
        ctx = {
            'profile_id': profile_id,
            'hand_focus': hand_focus,
            'variation_cluster_id': variation_cluster_id,
            'variation_diversity': variation_diversity,
            'canonical_templates_count': canonical_templates_count,
            'recording': recording_metadata,
            'timing_stats': timing_stats,
            'modality_coverage': modality_coverage
        }

        # 3. Generate "_NULL_" class (background/transition frames)
        # ASSUMPTION: Signs typically don't start in the first second of recording.
        # Use the first WINDOW_SIZE frames as "pre-sign" noise
        if len(normalized_frames) >= WINDOW_SIZE:
            null_window = normalized_frames[:WINDOW_SIZE]
            null_samples = create_sliding_windows(null_window, "_NULL_", ctx)
            # Limit to 2 samples to prevent class imbalance
            data.extend(null_samples[:2])

        # 4. Generate sliding windows for the actual sign
        sign_samples = create_sliding_windows(normalized_frames, label, ctx)
        data.extend(sign_samples)

    # ========== PROCESS DEFAULT VIDEO EXAMPLES (GLOBAL) ========== 
    video_examples_dir = DATA_DIR / "dgs_video_examples"
    if video_examples_dir.exists():
        for video_file in video_examples_dir.glob("*.mp4"):
            label = video_file.stem
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
                # Normalize frames
                v_normalized = []
                for f in v_frames:
                    vec = _normalize_frame(
                        f.get("landmarks"),
                        f.get("poseLandmarks"),
                        f.get("faceLandmarks")
                    )
                    if vec is not None:
                        v_normalized.append(vec)
                
                if v_normalized:
                    v_ctx = {'profile_id': None}  # Global examples
                    v_samples = create_sliding_windows(v_normalized, label, v_ctx)
                    data.extend(v_samples)

    stats = {
        "entries": len(entries),
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "cache_writes": cache_writes,
    }
    return data, stats


def build_samples_from_legacy_dataset(dataset_path: Path) -> List[Sample]:
    """
    DEPRECATED: This function is incompatible with the sliding window architecture.
    Legacy samples contain pre-averaged landmarks that cannot be converted to
    temporal windows. Samples produced by this function will fail dimension
    validation in dataset_to_arrays().
    """
    import warnings
    warnings.warn(
        "build_samples_from_legacy_dataset is deprecated and incompatible with "
        "the sliding window architecture. Use build_samples_from_manifest instead.",
        DeprecationWarning,
        stacklevel=2
    )
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
    """
    Convert Sample objects to training arrays.
    
    CRITICAL: Sample.landmarks now contains pre-normalized window vectors (48,870 floats),
    so we skip normalization here. Just convert to numpy arrays. 
    
    Note: Augmentation is disabled for temporal windows since geometric transforms
    on flattened vectors would break temporal coherence. Augmentation happens naturally
    through overlapping sliding windows (stride=1).
    
    Returns:
        X: Feature matrix (N, 48870)
        y: Label indices (N,)
        label_set: Sorted list of unique labels
        weights: Per-sample quality weights (N,)
    """
    label_set = sorted({sample.label for sample in samples})
    label_to_idx = {label: idx for idx, label in enumerate(label_set)}

    X_list: List[np.ndarray] = []
    y_list: List[int] = []
    weight_list: List[float] = []

    for sample in samples:
        # Sample.landmarks is already a normalized, flattened window vector
        features = np.array(sample.landmarks, dtype=np.float32)
        
        # Validate expected dimensions
        if features.size != WINDOW_FEATURE_SIZE:
            LOGGER.warning(
                f"Unexpected feature size {features.size} for sample {sample.label}. "
                f"Expected {WINDOW_FEATURE_SIZE}. Skipping."
            )
            continue
        
        X_list.append(features)
        y_list.append(label_to_idx[sample.label])
        weight_list.append(_compute_quality_weight(sample))
        
        # NOTE: Augmentation disabled for temporal windows
        # Overlapping windows (stride=1) already provide data augmentation
        # Geometric augmentation on flattened vectors would break temporal structure

    if not X_list:
        return (
            np.zeros((0, WINDOW_FEATURE_SIZE), dtype=np.float32),
            np.zeros((0,), dtype=np.int64),
            label_set,
            np.zeros((0,), dtype=np.float32),
        )

    X = np.vstack(X_list)
    y = np.array(y_list, dtype=np.int64)
    weights = np.array(weight_list, dtype=np.float32)
    
    return X, y, label_set, weights


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


def filter_samples_by_profile(samples: List[Sample], profile_id: str) -> List[Sample]:
    """Filter samples for a specific profile, including relevant global samples."""
    return filter_by_profile_logic(
        samples, 
        profile_id, 
        get_label=lambda s: s.label, 
        get_profile_id=lambda s: s.profile_id
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
        return indices, np.zeros((0,), np.int64)

    sanitized_fraction = float(np.clip(validation_fraction, 0.0, 1.0))
    validation_count = int(num_samples * sanitized_fraction)
    if validation_count >= num_samples:
        validation_count = num_samples - 1

    train_count = num_samples - validation_count

    train_indices = indices[:train_count]
    validation_indices = indices[train_count:]
    return train_indices, validation_indices


def save_model(
    path: Path, 
    weights: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray], 
    labels: List[str], 
    counts: Optional[np.ndarray] = None
) -> None:
    """
    Save 3-layer MLP weights with metadata for inference.
    
    Format:
        w1, b1, w2, b2, w3, b3: Network weights (transposed for compatibility)
        labels: Class names
        arch: Architecture identifier ("mlp_3layer_window")
        window_size: Temporal window size (30)
        input_dim: Expected input dimension (48,870)
    """
    w1, b1, w2, b2, w3, b3 = weights
    
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    
    save_dict = {
        # Network weights (transposed for row-major storage)
        "w1": np.array(w1.T, order="C"),
        "b1": b1,
        "w2": np.array(w2.T, order="C"),
        "b2": b2,
        "w3": np.array(w3.T, order="C"),
        "b3": b3,
        # Metadata
        "labels": np.array(labels),
        "arch": "mlp_3layer_window",
        "window_size": WINDOW_SIZE,
        "input_dim": WINDOW_FEATURE_SIZE,
        "feature_size": INPUT_FEATURE_SIZE,
        "layer_sizes": np.array([MLP_LAYER1_SIZE, MLP_LAYER2_SIZE], dtype=np.int32)
    }
    if counts is not None:
        save_dict["counts"] = counts
    else:
        save_dict["counts"] = np.zeros(len(labels), dtype=np.float32)

    with tmp_path.open("wb") as handle:
        np.savez_compressed(handle, **save_dict)
    
    os.replace(tmp_path, path)
    try:
        os.chmod(path, 0o640)
    except OSError:
        pass


def _compute_accuracy(
    X: np.ndarray,
    y: np.ndarray,
    weights: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]
) -> float:
    if X.size == 0 or y.size == 0:
        return 0.0
    w1, b1, w2, b2, w3, b3 = weights
    probs, _, _, _, _ = _forward_mlp(X, w1, b1, w2, b2, w3, b3)
    preds = np.argmax(probs, axis=1)
    return float(np.mean(preds == y))


def _compute_f1_score(
    X: np.ndarray,
    y: np.ndarray,
    weights: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
    num_classes: int
) -> float:
    if X.size == 0 or y.size == 0:
        return 0.0
    w1, b1, w2, b2, w3, b3 = weights
    probs, _, _, _, _ = _forward_mlp(X, w1, b1, w2, b2, w3, b3)
    preds = np.argmax(probs, axis=1)
    
    f1_scores = []
    for i in range(num_classes):
        tp = np.sum((preds == i) & (y == i))
        fp = np.sum((preds == i) & (y != i))
        fn = np.sum((preds != i) & (y == i))
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        f1_scores.append(f1)
        
    return float(np.mean(f1_scores))


def _compute_confusion_matrix(
    X: np.ndarray,
    y: np.ndarray,
    weights: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
    num_classes: int
) -> List[List[int]]:
    if X.size == 0 or y.size == 0:
        return [[0]*num_classes for _ in range(num_classes)]
    w1, b1, w2, b2, w3, b3 = weights
    probs, _, _, _, _ = _forward_mlp(X, w1, b1, w2, b2, w3, b3)
    preds = np.argmax(probs, axis=1)
    
    cm = [[0]*num_classes for _ in range(num_classes)]
    for true_label, pred_label in zip(y, preds):
        cm[int(true_label)][int(pred_label)] += 1
    return cm


def run_training_pipeline(samples: List[Sample], *, config: Optional[TrainingConfig] = None, output_dir: Optional[Path] = None, rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None) -> Dict[str, object]:
    """Train global and per-profile models and return detailed metrics."""

    if not samples:
        return {"error": "No training samples found."}

    resolved_config = config or TrainingConfig()
    label_set = sorted({s.label for s in samples})
    
    # Global training
    X, y, labels, weights = dataset_to_arrays(
        samples, 
        augmentations_per_sample=resolved_config.augmentations_per_sample, 
        rng=rng
    )
    
    if labels != label_set:
        LOGGER.warning("Label set mismatch between samples and arrays")
        label_set = labels

    num_classes = len(label_set)
    if num_classes < 1:
        return {"error": "No labels found in training data."}

    # Stratified split or simple shuffle
    train_idx, val_idx = plan_train_validation_split(
        X, 
        validation_fraction=resolved_config.validation_fraction, 
        rng=rng
    )
    
    X_train, y_train = X[train_idx], y[train_idx]
    w_train = weights[train_idx]
    
    validation_data = None
    if val_idx.size > 0:
        validation_data = (X[val_idx], y[val_idx])
        val_weights = weights[val_idx]
    else:
        val_weights = None

    # Train global model
    global_weights = train_mlp(
        X_train,
        y_train,
        num_classes,
        config=resolved_config,
        sample_weights=w_train,
        validation_data=validation_data,
        validation_sample_weights=val_weights,
        rng=rng,
    )
    
    # If returned TrainingSnapshots, extract best weights
    if isinstance(global_weights, TrainingSnapshots):
        global_best_weights = global_weights.best_weights
    else:
        global_best_weights = global_weights

    # Evaluate global model
    global_accuracy = _compute_accuracy(X, y, global_best_weights)
    global_f1 = _compute_f1_score(X, y, global_best_weights, num_classes)
    global_cm = _compute_confusion_matrix(X, y, global_best_weights, num_classes)
    
    class_counts = np.bincount(y, minlength=num_classes)
    
    if output_dir:
        save_model(output_dir / "global" / "amy_model.npz", global_best_weights, label_set, class_counts)

    # Per-profile models
    profile_reports = {}
    profiles = {s.profile_id for s in samples if s.profile_id}
    
    for profile_id in profiles:
        p_samples = filter_samples_by_profile(samples, profile_id)
        if len(p_samples) < MIN_SAMPLES_PER_PROFILE:
            continue
            
        p_X, p_y, p_labels, p_weights = dataset_to_arrays(p_samples, rng=rng)
        p_num_classes = len(p_labels)
        
        if p_num_classes < 1:
            continue
            
        # Per-profile split
        p_train_idx, p_val_idx = plan_train_validation_split(
            p_X, 
            validation_fraction=resolved_config.validation_fraction, 
            rng=rng
        )
        
        p_validation_data = None
        p_val_weights = None
        if p_val_idx.size > 0:
            p_validation_data = (p_X[p_val_idx], p_y[p_val_idx])
            p_val_weights = p_weights[p_val_idx]
            
        # Train profile model
        p_weights_result = train_mlp(
            p_X[p_train_idx],
            p_y[p_train_idx],
            p_num_classes,
            config=resolved_config,
            sample_weights=p_weights[p_train_idx],
            validation_data=p_validation_data,
            validation_sample_weights=p_val_weights,
            rng=rng,
        )
        
        if isinstance(p_weights_result, TrainingSnapshots):
            p_best_weights = p_weights_result.best_weights
        else:
            p_best_weights = p_weights_result
            
        p_accuracy = _compute_accuracy(p_X, p_y, p_best_weights)
        p_f1 = _compute_f1_score(p_X, p_y, p_best_weights, p_num_classes)
        
        p_counts = np.bincount(p_y, minlength=p_num_classes)
        
        if output_dir:
            save_model(output_dir / profile_id / "amy_model.npz", p_best_weights, p_labels, p_counts)
            
        profile_reports[profile_id] = {
            "accuracy": p_accuracy,
            "f1_score": p_f1,
            "samples": len(p_samples),
            "labels": p_labels,
            "class_counts": p_counts.tolist()
        }

    return {
        "global": {
            "accuracy": global_accuracy,
            "f1_score": global_f1,
            "confusion_matrix": global_cm,
            "samples": len(samples),
            "labels": label_set,
            "class_counts": class_counts.tolist()
        },
        "profiles": profile_reports,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


def main() -> None:
    global DATA_DIR, MODELS_DIR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=MANIFEST_PATH,
        help="Path to training bundle manifest JSON",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DATA_DIR,
        help="Root directory for landmark storage",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory to write trained weight files (defaults to models dir)",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        help="Maximum training epochs",
    )
    parser.add_argument(
        "--lr",
        type=float,
        help="Learning rate",
    )
    parser.add_argument(
        "--dropout",
        type=float,
        help="Dropout rate",
    )
    parser.add_argument(
        "--early-stopping",
        type=int,
        help="Patience for early stopping",
    )
    
    args = parser.parse_args()
    
    DATA_DIR = args.data_dir
    MODELS_DIR = args.output_dir or (DATA_DIR / "models")
    
    config = TrainingConfig(
        epochs=args.epochs if args.epochs is not None else EPOCHS,
        learning_rate=args.lr if args.lr is not None else LEARNING_RATE,
        dropout_rate=args.dropout if args.dropout is not None else DROPOUT_RATE,
        early_stopping_patience=args.early_stopping if args.early_stopping is not None else EARLY_STOPPING_PATIENCE,
    )
    
    try:
        samples, stats = build_samples_from_manifest(args.manifest)
        if not samples:
            print(json.dumps({"error": "No valid training samples found."}))
            return

        report = run_training_pipeline(samples, config=config, output_dir=MODELS_DIR)
        report["stats"] = stats
        print(json.dumps(report, indent=2))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()