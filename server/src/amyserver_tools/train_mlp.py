#!/usr/bin/env python3

"""Train Amy's sign language MLP from bundle manifests.

The script looks at the training bundle manifest produced by the app uploads,
converts each bundle into a training sample, trains a simple MLP, and writes
updated weight files for the global as well as per-profile models. A structured
training report is printed to stdout so callers (the Express server) can relay
status back to the app.

Amy First: Now supports multimodal training with audio + visual features!
"""

import argparse
import hashlib
import json
import logging
import math
import os
import re
import sys
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import numpy as np

# Add scripts directory to path for shared utils
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "scripts")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "training")))

# Import audio preprocessing at module level (performance)
try:
    from amyserver_tools.audio_preprocessing import (
        check_audio_dependencies,
        preprocess_audio_for_training,
    )
    AUDIO_PREPROCESSING_AVAILABLE = True
except ImportError:
    check_audio_dependencies = None
    preprocess_audio_for_training = None
    AUDIO_PREPROCESSING_AVAILABLE = False
from config_constants import (
    DROPOUT_RATE,
    EARLY_STOPPING_MIN_DELTA,
    EARLY_STOPPING_PATIENCE,
    EPOCHS,
    INPUT_FEATURE_SIZE,
    LEARNING_RATE,
    LOSS_EPSILON,
    MAX_AVG_FRAME_DELTA_MS,
    MIN_AVG_FRAME_DELTA_MS,
    MIN_CLIP_DURATION_MS,
    MIN_FACE_COVERAGE,
    MIN_HANDS_COVERAGE,
    MIN_POSE_COVERAGE,
    MIN_SAMPLES_PER_LABEL,
    MIN_SAMPLES_PER_PROFILE,
    MIN_USABLE_FRAME_RATIO,
    MLP_LAYER1_SIZE,
    MLP_LAYER2_SIZE,
    STILL_FRAME_WEIGHT,
    VALIDATION_FRACTION,
    WINDOW_FEATURE_SIZE,
    WINDOW_SIZE,
)
from feature_schema import TOTAL_HAND_LANDMARKS
from frame_normalization import _normalize_frame
from sliding_window import Sample, create_sliding_windows
from amyserver_tools.feature_pipeline import augment_temporal_window

from ml_shared_utils import filter_by_profile_logic

# Re-export architecture constants for module-level access (needed for tests)
MLP_LAYER1_SIZE = MLP_LAYER1_SIZE
MLP_LAYER2_SIZE = MLP_LAYER2_SIZE

LOGGER = logging.getLogger("amyserver.train_mlp")
if not LOGGER.handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    LOGGER.addHandler(handler)
LOGGER.setLevel(logging.INFO)
LOGGER.propagate = False

try:  # Optional heavy dependencies – we degrade gracefully when absent
    import cv2
    import mediapipe as mp
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

AUDIO_EXTENSIONS = {
    ".webm",
    ".opus",
    ".ogg",
    ".mp3",
    ".m4a",
    ".wav",
    ".aac",
}

# Multimodal Feature Configuration
# Amy First: Fixed-size audio representation for consistent MLP input
AUDIO_FEATURE_SIZE = 13  # MFCC coefficients (averaged over time)
MULTIMODAL_FEATURE_SIZE = WINDOW_FEATURE_SIZE + AUDIO_FEATURE_SIZE  # 48,870 + 13 = 48,883

MAX_FRAMES_PER_CLIP = int(os.environ.get("MLP_MAX_FRAMES", "120"))
FRAME_STRIDE = int(os.environ.get("MLP_FRAME_STRIDE", "2"))
# Augmentation via frame replication (disabled in favor of sliding windows)
AUGMENTATIONS_PER_SAMPLE = 0  # Set to 0 - overlapping windows provide augmentation

CLASS_WEIGHT_SMOOTHING = max(0.0, float(os.environ.get("MLP_CLASS_WEIGHT_SMOOTHING", "0.0")))

DEPENDENCIES_REQUIRED = os.environ.get("MLP_REQUIRE_MEDIAPIPE", "1").lower() not in {
    "0",
    "false",
    "no",
}

BUNDLE_LANDMARK_POLICY = os.environ.get(
    "MLP_BUNDLE_LANDMARK_POLICY",
    "bundle_only",
).strip().lower()
if BUNDLE_LANDMARK_POLICY not in {"bundle_only", "prefer_bundle", "prefer_server_extract"}:
    LOGGER.warning(
        "Unknown MLP_BUNDLE_LANDMARK_POLICY=%s, falling back to bundle_only",
        BUNDLE_LANDMARK_POLICY,
    )
    BUNDLE_LANDMARK_POLICY = "bundle_only"

# Hand landmark constants for processing
LANDMARKS_PER_HAND = TOTAL_HAND_LANDMARKS // 2
SECONDARY_HAND_WEIGHT = 0.3  # Weight for non-dominant hand in asymmetric gestures

WeightTuple = tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]

MODALITY_KEYS = ("hands", "pose", "face", "nonManual")
TRAINING_METADATA_FILENAME = "training_metadata.json"

def _emit_event(payload: dict[str, object]) -> None:
    """Log a structured progress event."""

    message = json.dumps(payload)
    print(message, file=sys.stderr, flush=True)
    LOGGER.info(message)

# --- Helpers ----------------------------------------------------------------

# Matches a trailing UUID suffix separated by a hyphen or underscore.
# Must stay in sync with TRAILING_UUID_SUFFIX_PATTERN in
# server/src/services/trainedLabelsService.ts and webapp/src/components/SignLanguageRecorder.tsx.
_TRAILING_UUID_SUFFIX_RE = re.compile(
    r"[_-][0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def normalize_training_label(raw_label: str) -> str:
    """Normalize a training label for stable class assignment.

    Profile-seeded symbols may carry ``<name>-<profileId>`` identifiers,
    and uploads can arrive with case-preserving display labels (e.g. "Hilfe").
    The trainer canonicalizes both variants so recordings collapse into a
    single class label during retraining.
    """
    import unicodedata

    trimmed = unicodedata.normalize("NFKC", raw_label).strip()
    trimmed = re.sub(r"\s+", " ", trimmed)
    without_uuid = _TRAILING_UUID_SUFFIX_RE.sub("", trimmed).strip()
    return without_uuid.lower()



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


def resolve_relative_path(base: Path, relative: str) -> Path | None:
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


def load_json(path: Path) -> dict | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as err:
        print(f"warning: failed to parse JSON from {path}: {err}", file=sys.stderr)
        return None


def sha256_file(path: Path) -> str | None:
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        return None
    digest = hashlib.sha256()
    digest.update(data)
    return digest.hexdigest()


def extract_base_label_from_video_filename(filename: str) -> str:
    """Extract the base DGS label from a video filename.
    
    Video naming conventions:
    - Base videos: '{label}.mp4' → label = '{label}'
    - Main variations: '{label}_main_{term}.mp4' → label = '{label}'
    - Variant variations: '{label}_var_{term}_{index}.mp4' → label = '{label}'
    
    This ensures all video variations are grouped under their canonical label
    for proper training data association.
    
    Args:
        filename: Video filename (with or without .mp4 extension)
        
    Returns:
        Base label extracted from the filename
        
    Examples:
        >>> extract_base_label_from_video_filename("alle.mp4")
        'alle'
        >>> extract_base_label_from_video_filename("alle_main_alle")
        'alle'
        >>> extract_base_label_from_video_filename("trinken_var_wasser_0.mp4")
        'trinken'
    """
    # Remove extension if present
    stem = filename.rsplit('.', 1)[0] if '.' in filename else filename
    
    # Find the first occurrence of either separator
    # This is more robust than iterating - handles edge cases like
    # 'label_var_x_main_y.mp4' which should return 'label' (first separator wins)
    main_idx = stem.find('_main_')
    var_idx = stem.find('_var_')
    
    valid_indices = [i for i in (main_idx, var_idx) if i != -1]
    if valid_indices:
        separator_idx = min(valid_indices)
        return stem[:separator_idx]
    
    # For base videos, the stem IS the label
    return stem


def apply_hand_focus(
    landmarks: list[list[float]],
    hand_focus: str | None,
    handedness: list[str] | None = None,
) -> list[list[float]]:
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
    hand_to_zero: range | None = None
    hand_to_weight: range | None = None

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




def _extract_mirror_safe(metadata: dict) -> bool:
    aug = metadata.get("augmentation") if isinstance(metadata, dict) else None
    if isinstance(aug, dict) and isinstance(aug.get("mirrorSafe"), bool):
        return bool(aug.get("mirrorSafe"))
    if isinstance(metadata.get("mirrorSafe"), bool):
        return bool(metadata.get("mirrorSafe"))
    return False

def _extract_recording_metadata(metadata: dict) -> dict[str, object] | None:
    recording = metadata.get("recording") if isinstance(metadata, dict) else None
    if not isinstance(recording, dict):
        return None
    cleaned: dict[str, object] = {}
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


def _extract_modality_coverage(metadata: dict) -> dict[str, float] | None:
    modalities = metadata.get("modalities") if isinstance(metadata, dict) else None
    if not isinstance(modalities, dict):
        return None
    coverage: dict[str, float] = {}
    for key in MODALITY_KEYS:
        stats = modalities.get(key)
        if isinstance(stats, dict):
            raw = stats.get("coverage")
            if isinstance(raw, (int, float)) and math.isfinite(raw):
                coverage[key] = float(raw)
    return coverage or None


def _summarize_frame_modalities(frames: list[dict]) -> tuple[dict[str, int], dict[str, float]]:
    counts = dict.fromkeys(MODALITY_KEYS, 0)
    total_frames = len(frames)
    landmark_map = {
        "hands": "landmarks",
        "pose": "poseLandmarks",
        "face": "faceLandmarks",
        "nonManual": "nonManualFeatures",
    }
    for frame in frames:
        for key, frame_key in landmark_map.items():
            landmarks = frame.get(frame_key)
            if key == "nonManual":
                if isinstance(landmarks, dict) and any(
                    value is not None for value in landmarks.values()
                ):
                    counts[key] += 1
                continue
            if isinstance(landmarks, list) and len(landmarks) > 0:
                counts[key] += 1
    coverage = {
        key: (counts[key] / total_frames if total_frames > 0 else 0.0)
        for key in MODALITY_KEYS
    }
    return counts, coverage


def _resolve_modality_coverage(
    explicit: dict[str, float] | None,
    fallback_coverage: dict[str, float],
) -> dict[str, float] | None:
    if explicit:
        return explicit
    if any(value > 0 for value in fallback_coverage.values()):
        return fallback_coverage
    return None


def _infer_modality_presence(
    coverage: dict[str, float] | None,
    frame_counts: dict[str, int],
) -> dict[str, bool]:
    presence: dict[str, bool] = {}
    for key in MODALITY_KEYS:
        value = coverage.get(key) if coverage else None
        if isinstance(value, (int, float)) and value > 0:
            presence[key] = True
        else:
            presence[key] = frame_counts.get(key, 0) > 0
    return presence


def _update_modality_totals(
    samples: list[Sample],
    presence: dict[str, bool],
    modality_counts: dict[str, int],
) -> int:
    if not samples:
        return 0
    sample_count = len(samples)
    for key in MODALITY_KEYS:
        if presence.get(key):
            modality_counts[key] += sample_count
    return sample_count


def _analyze_frame_timing(frames: list[dict]) -> dict[str, float] | None:
    timestamps: list[float] = []
    for frame in frames:
        value = frame.get("timestampMs")
        if isinstance(value, (int, float)) and math.isfinite(value):
            timestamps.append(float(value))
    if len(timestamps) < 2:
        return None
    deltas: list[float] = []
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


def _apply_timing_weights(frames: list[dict]) -> dict[str, float] | None:
    timestamps: list[tuple[int, float]] = []
    for idx, frame in enumerate(frames):
        value = frame.get("timestampMs")
        if isinstance(value, (int, float)) and math.isfinite(value):
            timestamps.append((idx, float(value)))
    if len(timestamps) < 2:
        return None
    deltas: list[float] = []
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


def _summarize_recording_stats(samples: list[Sample]) -> dict[str, object]:
    frame_counts: list[float] = []
    usable_counts: list[float] = []
    clip_durations: list[float] = []
    timing_variances: list[float] = []
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

    def _avg(values: list[float]) -> float | None:
        return float(sum(values) / len(values)) if values else None

    return {
        "samplesWithRecording": len(frame_counts),
        "averageFrameCount": _avg(frame_counts),
        "averageUsableFrameCount": _avg(usable_counts),
        "averageClipDurationMs": _avg(clip_durations),
        "averageTimingVarianceMs": _avg(timing_variances),
        "nonMonotonicTimingSamples": non_monotonic,
    }


def extract_landmarks_from_clip(clip_path: Path) -> list[dict]:
    """Run MediaPipe on a clip and return landmark dictionaries."""
    _require_hand_landmark_dependencies(f"Videoclip {clip_path}")
    if cv2 is None or mp is None:
        return []

    frames: list[dict] = []
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
                        multimodal_failed = False
                        while cap.isOpened() and len(frames) < MAX_FRAMES_PER_CLIP:
                            success, frame = cap.read()
                            if not success:
                                break
                            if index % FRAME_STRIDE != 0:
                                index += 1
                                continue

                            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

                            try:
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
                            except Exception as e:
                                print(f"warning: Multimodal detection failed for frame {index}: {e}", file=sys.stderr)
                                multimodal_failed = True
                                break # Exit the with block but keep existing frames

                            index += 1

                        if not multimodal_failed:
                            return frames
                except Exception as e:
                    print(f"warning: Multimodal Tasks API setup or processing failed: {e}", file=sys.stderr)
                    # We continue to the hands-only fallback if needed, but we keep whatever frames we got

            # Scenario 2: Hands-only fallback (Only hand model available OR multimodal failed halfway)
            if hand_model.exists():
                # If we already have some frames, we need to continue from where we left off
                # cap position is already advanced.
                remaining_frames_count = MAX_FRAMES_PER_CLIP - len(frames)
                if remaining_frames_count <= 0:
                    return frames

                try:
                    base_options = mp_tasks.BaseOptions(model_asset_path=str(hand_model))
                    options = mp_vision.HandLandmarkerOptions(
                        base_options=base_options,
                        num_hands=2,
                        running_mode=mp_vision.RunningMode.IMAGE
                    )
                    with mp_vision.HandLandmarker.create_from_options(options) as landmarker:
                        # Continue from current cap position
                        while cap.isOpened() and len(frames) < MAX_FRAMES_PER_CLIP:
                            # We might have been in the middle of a stride window,
                            # but for simplicity we just continue reading.
                            success, frame = cap.read()
                            if not success:
                                break
                            # Use current global index for stride consistency
                            # But wait, Scenario 1 might have stopped at index N.
                            # index is already set from the previous loop if it entered.

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

                return frames
    finally:
        cap.release()

    return frames


def extract_landmarks_from_still(still_path: Path) -> dict | None:
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


# --- Temporal Sliding Window logic ------------------------------------------

_UNSET = object()


@dataclass(frozen=True)
class TrainingConfig:
    """Configuration values that control the trainer's behaviour."""

    hidden_size: int = 512 # Deprecated but kept for compat
    epochs: int = EPOCHS
    learning_rate: float = LEARNING_RATE
    dropout_rate: float = DROPOUT_RATE
    validation_fraction: float = VALIDATION_FRACTION
    augmentations_per_sample: int = AUGMENTATIONS_PER_SAMPLE
    class_weight_smoothing: float = 0.0
    sampling_mode: str = "standard"
    episodic_n_way: int = 4
    episodic_k_shot: int = 2
    episodic_queries_per_class: int = 1
    episodic_num_episodes: int = 8
    early_stopping_patience: int | None = EARLY_STOPPING_PATIENCE
    early_stopping_min_delta: float = EARLY_STOPPING_MIN_DELTA
    return_best_and_final: bool = False
    random_seed: int | None = None


@dataclass
class TrainingSnapshots:
    """Container for the best and terminal weights observed during training."""

    best_weights: WeightTuple
    final_weights: WeightTuple
    best_epoch: int
    final_epoch: int


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
    dropout_mask1: np.ndarray | None = None,
    dropout_mask2: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
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
    config: TrainingConfig | None = None,
    hidden_size: int | None = _UNSET,  # Deprecated (hardcoded to 1024/512)
    epochs: int | None = _UNSET,
    learning_rate: float | None = _UNSET,
    dropout_rate: float | None = _UNSET,
    early_stopping_patience: int | None = _UNSET,
    early_stopping_min_delta: float | None = _UNSET,
    sample_weights: np.ndarray | None = None,
    validation_data: tuple[np.ndarray, np.ndarray] | None = None,
    validation_sample_weights: np.ndarray | None = None,
    rng: np.random.RandomState | np.random.Generator | None = None,
    return_best_and_final: bool | None = _UNSET,
) -> WeightTuple | TrainingSnapshots:
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
    input_dim = X.shape[1]  # 48,870 (visual) or 48,883 (multimodal)
    layer1_size = MLP_LAYER1_SIZE  # 512
    layer2_size = MLP_LAYER2_SIZE  # 256

    if input_dim != WINDOW_FEATURE_SIZE and input_dim != MULTIMODAL_FEATURE_SIZE:
        LOGGER.warning(
            f"Input dimension {input_dim} does not match WINDOW_FEATURE_SIZE {WINDOW_FEATURE_SIZE} "
            f"or MULTIMODAL_FEATURE_SIZE {MULTIMODAL_FEATURE_SIZE}. "
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
    validation_X: np.ndarray | None = None
    validation_y: np.ndarray | None = None
    validation_weights = None
    validation_weight_sum: float | None = None
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

        # Layer 2 gradients (512 → 256)
        da2 = np.dot(dz3, w3.T)
        if dropout_mask2 is not None:
            da2 *= dropout_mask2
        dz2 = da2 * relu_derivative(z2)
        dw2 = np.dot(a1.T, dz2)
        db2 = np.sum(dz2, axis=0)

        # Layer 1 gradients (Input → 512)
        da1 = np.dot(dz2, w2.T)
        if dropout_mask1 is not None:
            da1 *= dropout_mask1
        dz1 = da1 * relu_derivative(z1)
        dw1 = np.dot(X.T, dz1)
        db1 = np.sum(dz1, axis=0)

        # ========== GRADIENT CLIPPING ==========
        # Prevent exploding gradients which can cause overflow/NaN weights
        for grad in [dw1, db1, dw2, db2, dw3, db3]:
            np.clip(grad, -1.0, 1.0, out=grad)

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


def _resolve_clip_path(entry: dict, bundle_dir: Path) -> Path | None:
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
    storage_files: list[str] = []
    if isinstance(storage_files_raw, list):
        for file_entry in storage_files_raw:
            if isinstance(file_entry, str) and file_entry.strip():
                normalized = file_entry.replace("\\", "/").lstrip("/")
                if normalized:
                    storage_files.append(normalized)

    clip_extension = Path(clip_filename).suffix.lower() if clip_filename else ""
    if storage_files:
        found_by_ext: Path | None = None
        found_by_any_video_ext: Path | None = None
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


def _resolve_still_path(entry: dict, bundle_dir: Path) -> Path | None:
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

        resolved_by_extension: Path | None = None
        resolved_by_image_ext: Path | None = None

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


def _resolve_audio_path(entry: dict, bundle_dir: Path) -> Path | None:
    """
    Resolve audio file path from training bundle entry.
    
    Amy First: Enables multimodal recognition by locating audio files
    containing verbal utterances (e.g., Amy saying "Iila" for purple).
    """
    storage = entry.get("storage", {}) if isinstance(entry, dict) else {}
    if isinstance(storage, dict):
        # Try storage.audio first
        storage_audio = storage.get("audio")
        if isinstance(storage_audio, str):
            resolved = resolve_relative_path(bundle_dir, storage_audio)
            if resolved is not None:
                return resolved

        # Try to find audio in storage.files
        storage_files = storage.get("files") or []
        metadata = entry.get("metadata", {}) if isinstance(entry.get("metadata"), dict) else {}
        audio_filename_raw = metadata.get("audioFilename")
        audio_filename = None
        if isinstance(audio_filename_raw, str):
            audio_filename = audio_filename_raw.strip()
            if not audio_filename:
                audio_filename = None

        audio_extension = Path(audio_filename).suffix.lower() if audio_filename else None
        lower_audio_name = audio_filename.lower() if audio_filename else None

        resolved_by_extension: Path | None = None
        resolved_by_audio_ext: Path | None = None

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
            # Exact match on filename
            if lower_audio_name and lower_base == lower_audio_name:
                return candidate

            # Match by extension from metadata
            if (
                resolved_by_extension is None
                and audio_extension
                and lower_base.endswith(audio_extension)
            ):
                resolved_by_extension = candidate

            # Match any audio extension
            if (
                resolved_by_audio_ext is None
                and Path(relative).suffix.lower() in AUDIO_EXTENSIONS
            ):
                resolved_by_audio_ext = candidate

        if resolved_by_extension is not None:
            return resolved_by_extension
        if resolved_by_audio_ext is not None:
            return resolved_by_audio_ext

        # Try by filename from metadata
        if audio_filename:
            resolved = resolve_relative_path(bundle_dir, audio_filename)
            if resolved is not None:
                return resolved

    # No audio file found - this is OK, audio is optional
    return None




def should_extract_bundle_landmarks_from_clip(policy: str) -> bool:
    """Return whether bundle entries may trigger server-side clip extraction."""
    return policy in {"prefer_bundle", "prefer_server_extract"}




def create_empty_training_stats() -> dict[str, object]:
    return {
        "entries": 0,
        "cache_hits": 0,
        "cache_misses": 0,
        "cache_writes": 0,
        "modality_counts": dict.fromkeys(MODALITY_KEYS, 0),
        "modality_sample_total": 0,
        "bundle_fallback_extractions": 0,
        "bundle_missing_landmarks": 0,
        "bundle_landmark_policy": BUNDLE_LANDMARK_POLICY,
    }


def load_frame_list_for_bundle(
    landmarks_path: Path,
    cache_path: Path,
    clip_path: Path | None,
    still_path: Path | None,
) -> tuple[list[dict], dict[str, int]]:
    """Load frames for one bundle entry and return frame list + local counters."""

    local = {
        "cache_hits": 0,
        "cache_misses": 0,
        "cache_writes": 0,
        "bundle_fallback_extractions": 0,
        "bundle_missing_landmarks": 0,
    }

    frames: list[dict] | None = None
    frames_from_clip = False

    def mark_missing_landmarks() -> None:
        local["bundle_missing_landmarks"] += 1
        local["cache_misses"] += 1

    cached = load_json(cache_path)
    cache_hit = bool(cached and isinstance(cached.get("frames"), list))
    if cache_hit:
        frames = cached["frames"]
        local["cache_hits"] += 1
    else:
        source = load_json(landmarks_path)
        if source and isinstance(source.get("frames"), list):
            frames = source["frames"]
            local["cache_misses"] += 1
        elif (
            clip_path
            and clip_path.exists()
            and should_extract_bundle_landmarks_from_clip(BUNDLE_LANDMARK_POLICY)
        ):
            try:
                frames = extract_landmarks_from_clip(clip_path)
            except DependencyUnavailableError as error:
                LOGGER.warning("Skipping clip extraction for %s: %s", clip_path, error)
                frames = None

            if frames:
                frames_from_clip = True
                local["bundle_fallback_extractions"] += 1
            else:
                mark_missing_landmarks()
        else:
            mark_missing_landmarks()

    frame_list: list[dict] = list(frames) if frames else []

    if still_path and still_path.exists() and not cache_hit:
        try:
            extracted = extract_landmarks_from_still(still_path)
        except DependencyUnavailableError as error:
            LOGGER.warning("Skipping still extraction for %s: %s", still_path, error)
            extracted = None
        if extracted:
            extracted["weight"] = STILL_FRAME_WEIGHT
            frame_list.append(extracted)

    if frames_from_clip and frame_list:
        local["cache_writes"] += 1
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with cache_path.open("w", encoding="utf-8") as handle:
            json.dump({"frames": frame_list}, handle, indent=2)

    return frame_list, local




@lru_cache(maxsize=1)
def _audio_dependencies_available() -> bool:
    if not AUDIO_PREPROCESSING_AVAILABLE:
        return False
    return bool(check_audio_dependencies())


def load_audio_features_for_bundle(
    audio_path: Path | None,
    label: str,
    profile_id: str | None,
) -> tuple[dict | None, dict | None]:
    if not audio_path or not audio_path.exists():
        return None, None

    try:
        if not AUDIO_PREPROCESSING_AVAILABLE:
            LOGGER.warning(
                "Audio preprocessing module not available, skipping audio for label='%s', profile='%s'",
                label,
                profile_id,
            )
            return None, None

        if not _audio_dependencies_available():
            return None, None

        audio_result = preprocess_audio_for_training(
            audio_path,
            target_duration_frames=None,
            feature_type='mfcc',
        )
        if audio_result.get('features') and not audio_result.get('error'):
            audio_features_dict = audio_result['features']
            audio_metadata_dict = {
                'duration_ms': audio_result.get('duration_ms', 0),
                'has_speech': audio_result.get('has_speech', False),
                'energy': audio_result.get('energy', 0.0),
                'sample_rate': audio_result.get('sample_rate', 16000),
            }
            LOGGER.info("Loaded audio features for %s: %s", label, audio_metadata_dict)
            return audio_features_dict, audio_metadata_dict

        if audio_result.get('error'):
            LOGGER.warning("Audio preprocessing failed for %s: %s", label, audio_result['error'])
        return None, None
    except Exception as error:
        LOGGER.warning("Failed to process audio for %s: %s", label, error)
        return None, None


def build_samples_from_manifest(manifest_path: Path, skip_examples: bool = False) -> tuple[list[Sample], dict[str, object]]:
    """
    Load training data from manifest and generate sliding window samples.
    
    Key Changes from Baseline:
    - Removed frame averaging logic entirely
    - Each clip generates multiple training samples (sliding windows)
    - Automatically creates "_NULL_" class from clip starts (background modeling)
    """
    manifest = load_json(manifest_path)
    if not manifest:
        return [], create_empty_training_stats()

    entries = manifest.get("entries", [])
    data: list[Sample] = []
    cache_hits = 0
    cache_misses = 0
    cache_writes = 0
    bundle_fallback_extractions = 0
    bundle_missing_landmarks = 0
    modality_counts = dict.fromkeys(MODALITY_KEYS, 0)
    modality_sample_total = 0

    for entry in entries:
        label = entry.get("label")
        if not label:
            continue

        # Normalize the label to strip trailing UUID suffixes so that
        # e.g. "Trinken" and "Trinken-<profileId>" merge into one class.
        label = normalize_training_label(label)
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
        mirror_safe = _extract_mirror_safe(metadata)

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
        audio_path = _resolve_audio_path(entry, bundle_dir)

        # ========== LOAD AUDIO FEATURES (if available) ==========
        audio_features_dict, audio_metadata_dict = load_audio_features_for_bundle(
            audio_path,
            label,
            profile_id,
        )

        # ========== LOAD FRAMES (with caching) ==========
        frame_list, frame_load_stats = load_frame_list_for_bundle(
            landmarks_path,
            cache_path,
            clip_path,
            still_path,
        )
        cache_hits += frame_load_stats["cache_hits"]
        cache_misses += frame_load_stats["cache_misses"]
        cache_writes += frame_load_stats["cache_writes"]
        bundle_fallback_extractions += frame_load_stats["bundle_fallback_extractions"]
        bundle_missing_landmarks += frame_load_stats["bundle_missing_landmarks"]

        timing_stats = _apply_timing_weights(frame_list)
        frame_modality_counts, frame_modality_coverage = _summarize_frame_modalities(frame_list)
        modality_coverage = _resolve_modality_coverage(modality_coverage, frame_modality_coverage)
        modality_presence = _infer_modality_presence(modality_coverage, frame_modality_counts)

        if not frame_list:
            continue

        # ========== NEW SLIDING WINDOW PROCESSING ==========

        # 1. Normalize each frame individually
        normalized_frames = []
        frame_weights = []
        for f in frame_list:
            lms = f.get("landmarks")
            pose = f.get("poseLandmarks")
            face = f.get("faceLandmarks")
            w = float(f.get("weight", 1.0))

            # Apply hand focus filtering if specified
            if hand_focus and lms:
                lms = apply_hand_focus(lms, hand_focus, f.get("handedness"))

            # Normalize to (1629,) vector
            vec = _normalize_frame(lms, pose, face)
            if vec is not None:
                normalized_frames.append(vec)
                frame_weights.append(w)

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
            'modality_coverage': modality_coverage,
            'audio_features': audio_features_dict,
            'audio_metadata': audio_metadata_dict,
            'mirror_safe': mirror_safe,
        }

        # 3. Generate "_NULL_" class (background/transition frames)
        # Skip automatic heuristic for now to avoid class collisions
        # If explicitly marked negative samples are needed, they should be added via dedicated logic
        pass

        # 4. Generate sliding windows for the actual sign
        sign_samples = create_sliding_windows(normalized_frames, label, ctx, frame_weights)
        data.extend(sign_samples)
        modality_sample_total += _update_modality_totals(
            sign_samples,
            modality_presence,
            modality_counts,
        )

    # ========== PROCESS DEFAULT VIDEO EXAMPLES (GLOBAL) ==========
    if not skip_examples:
        video_examples_dir = DATA_DIR / "dgs_video_examples"
        if video_examples_dir.exists():
            for video_file in video_examples_dir.glob("*.mp4"):
                # Extract base label from filename to handle variations properly
                # e.g., "alle_main_alle.mp4" → "alle", "trinken_var_wasser_0.mp4" → "trinken"
                raw_stem = video_file.stem
                label = extract_base_label_from_video_filename(raw_stem)
                
                # Cache path still uses full filename to avoid collisions
                video_cache_path = video_examples_dir / f"{raw_stem}_landmarks.json"

                v_frames: list[dict] | None = None
                if video_cache_path.exists():
                    v_cached = load_json(video_cache_path)
                    if v_cached and isinstance(v_cached.get("frames"), list):
                        v_frames = v_cached["frames"]
                        cache_hits += 1

                if not v_frames:
                    # If dependencies are missing, we can't extract new landmarks
                    if cv2 is None or mp is None:
                        LOGGER.warning(f"MediaPipe unavailable, skipping extraction for {video_file.name}")
                        continue
                        
                    LOGGER.info(f"Extracting landmarks from default example: {video_file.name} (label: {label})")
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
                    v_weights = []
                    for f in v_frames:
                        w = float(f.get("weight", 1.0))
                        vec = _normalize_frame(
                            f.get("landmarks"),
                            f.get("poseLandmarks"),
                            f.get("faceLandmarks")
                        )
                        if vec is not None:
                            v_normalized.append(vec)
                            v_weights.append(w)

                    if v_normalized:
                        v_frame_counts, v_frame_coverage = _summarize_frame_modalities(v_frames)
                        v_presence = _infer_modality_presence(v_frame_coverage, v_frame_counts)
                        v_ctx = {
                            'profile_id': None,
                            'modality_coverage': v_frame_coverage,
                            'video_source': raw_stem,  # Track original video for debugging
                        }  # Global examples
                        v_samples = create_sliding_windows(v_normalized, label, v_ctx, v_weights)
                        data.extend(v_samples)
                        modality_sample_total += _update_modality_totals(
                            v_samples,
                            v_presence,
                            modality_counts,
                        )

    stats = {
        "entries": len(entries),
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "cache_writes": cache_writes,
        "modality_counts": modality_counts,
        "modality_sample_total": modality_sample_total,
        "bundle_fallback_extractions": bundle_fallback_extractions,
        "bundle_missing_landmarks": bundle_missing_landmarks,
        "bundle_landmark_policy": BUNDLE_LANDMARK_POLICY,
    }
    return data, stats



def _prepare_audio_features(audio_features_list: list[float] | None) -> np.ndarray:
    """
    Convert variable-length audio features to fixed-size representation.
    
    Amy First: Ensures consistent dimensions for multimodal training.
    Uses mean pooling over time to create a fixed-size audio vector.
    
    Args:
        audio_features_list: Flattened MFCC features (13 x n_frames) or None
        
    Returns:
        Fixed-size audio feature vector (13,) - zeros if no audio
    """
    if not audio_features_list or len(audio_features_list) == 0:
        # No audio: return zero vector
        return np.zeros(AUDIO_FEATURE_SIZE, dtype=np.float32)
    
    # Reshape from flattened to (13, n_frames) assuming MFCC with 13 coefficients
    audio_array = np.array(audio_features_list, dtype=np.float32)
    
    # If already the right size, return as-is
    if len(audio_array) == AUDIO_FEATURE_SIZE:
        return audio_array
    
    # Reshape to (13, n_frames) and average over time dimension
    try:
        n_frames = len(audio_array) // AUDIO_FEATURE_SIZE
        if n_frames > 0:
            reshaped = audio_array[:n_frames * AUDIO_FEATURE_SIZE].reshape(AUDIO_FEATURE_SIZE, n_frames)
            # Average over time (axis=1)
            audio_fixed = np.mean(reshaped, axis=1)
            return audio_fixed.astype(np.float32)
        else:
            # Too few features, pad with zeros
            padded = np.zeros(AUDIO_FEATURE_SIZE, dtype=np.float32)
            padded[:len(audio_array)] = audio_array[:AUDIO_FEATURE_SIZE]
            return padded
    except Exception as e:
        LOGGER.warning(f"Failed to reshape audio features: {e}. Using zero padding.")
        return np.zeros(AUDIO_FEATURE_SIZE, dtype=np.float32)


def dataset_to_arrays(
    samples: list[Sample],
    *,
    augmentations_per_sample: int = 0,
    rng: np.random.RandomState | np.random.Generator | None = None,
    use_multimodal: bool = True,
    provenance_sink: dict[str, object] | None = None,
) -> tuple[np.ndarray, np.ndarray, list[str], np.ndarray]:
    """Convert Sample objects to training arrays with optional temporal augmentation."""
    label_set = sorted({sample.label for sample in samples})
    label_to_idx = {label: idx for idx, label in enumerate(label_set)}

    X_list: list[np.ndarray] = []
    y_list: list[int] = []
    weight_list: list[float] = []
    has_any_audio = any(sample.audio_features for sample in samples)
    augmentation_provenance: list[dict[str, object]] = []

    for sample in samples:
        features = np.array(sample.landmarks, dtype=np.float32)
        if features.size != WINDOW_FEATURE_SIZE:
            LOGGER.warning(
                f"Unexpected feature size {features.size} for sample {sample.label}. "
                f"Expected {WINDOW_FEATURE_SIZE}. Skipping."
            )
            continue

        variants: list[np.ndarray] = [features]
        if augmentations_per_sample > 0:
            window = features.reshape(WINDOW_SIZE, INPUT_FEATURE_SIZE)
            for _ in range(augmentations_per_sample):
                augmented_window, aug_meta = augment_temporal_window(
                    window,
                    rng=rng,
                    mirror_safe=bool(getattr(sample, "mirror_safe", False)),
                )
                variants.append(augmented_window.reshape(WINDOW_FEATURE_SIZE))
                augmentation_provenance.append({
                    "label": sample.label,
                    "profile_id": sample.profile_id,
                    "mirror_safe": bool(getattr(sample, "mirror_safe", False)),
                    **aug_meta,
                })

        for variant in variants:
            variant_features = variant
            if use_multimodal and has_any_audio:
                audio_features_fixed = _prepare_audio_features(sample.audio_features)
                variant_features = np.concatenate([variant, audio_features_fixed])
            X_list.append(variant_features)
            y_list.append(label_to_idx[sample.label])
            weight_list.append(_compute_quality_weight(sample) * sample.quality_weight)

    if provenance_sink is not None:
        provenance_sink["temporal_augmentations"] = augmentation_provenance
        provenance_sink["augmented_sample_count"] = len(augmentation_provenance)

    if not X_list:
        feature_dim = MULTIMODAL_FEATURE_SIZE if (use_multimodal and has_any_audio) else WINDOW_FEATURE_SIZE
        return (
            np.zeros((0, feature_dim), dtype=np.float32),
            np.zeros((0,), dtype=np.int64),
            label_set,
            np.zeros((0,), dtype=np.float32),
        )

    X = np.vstack(X_list)
    y = np.array(y_list, dtype=np.int64)
    weights = np.array(weight_list, dtype=np.float32)
    return X, y, label_set, weights




def build_episodic_indices(
    y: np.ndarray,
    *,
    n_way: int,
    k_shot: int,
    queries_per_class: int,
    num_episodes: int,
    rng: np.random.RandomState | np.random.Generator | None = None,
) -> np.ndarray:
    """Sample indices in N-way K-shot episodes for sparse-data discrimination."""
    if y.size == 0:
        return np.zeros((0,), dtype=np.int64)
    rand = rng if rng is not None else np.random.default_rng()
    labels = np.unique(y)
    if labels.size == 0:
        return np.zeros((0,), dtype=np.int64)

    per_class: dict[int, np.ndarray] = {int(label): np.where(y == label)[0] for label in labels}
    sample_size = max(1, int(k_shot) + int(queries_per_class))
    selected: list[int] = []

    for _ in range(max(1, int(num_episodes))):
        ways = min(max(1, int(n_way)), labels.size)
        class_choices = rand.choice(labels, size=ways, replace=False)
        for cls in class_choices:
            cls_idx = per_class[int(cls)]
            if cls_idx.size == 0:
                continue
            replace = cls_idx.size < sample_size
            picks = rand.choice(cls_idx, size=sample_size, replace=replace)
            selected.extend(int(p) for p in picks)

    return np.array(selected, dtype=np.int64) if selected else np.zeros((0,), dtype=np.int64)

def validate_samples(samples: list[Sample]) -> None:
    if not samples:
        LOGGER.warning("Keine Trainingsdaten gefunden - Training wird übersprungen.")
        return

    label_counts: dict[str, int] = {}
    profile_counts: dict[str, dict[str, int]] = {}

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


def filter_samples_by_profile(samples: list[Sample], profile_id: str) -> list[Sample]:
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
    rng: np.random.RandomState | np.random.Generator | None = None,
) -> tuple[np.ndarray, np.ndarray]:
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
    weights: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
    labels: list[str],
    counts: np.ndarray | None = None,
) -> None:
    """
    Save 3-layer MLP weights with metadata for inference.
    
    Format:
        w1, b1, w2, b2, w3, b3: Network weights (transposed for compatibility)
        labels: Class names
        arch: Architecture identifier ("mlp_3layer_window")
        window_size: Temporal window size (30)
        input_dim: Expected input dimension (derived from weights)
        feature_size: Per-frame feature dimension
        audio_feature_size: Audio feature vector length (0 for visual-only)
        layer_sizes: [layer1_size, layer2_size] derived from weights
    """
    w1, b1, w2, b2, w3, b3 = weights
    input_dim = int(w1.shape[0])
    layer1_size = int(w1.shape[1])
    layer2_size = int(w2.shape[1])
    audio_feature_size = max(0, input_dim - WINDOW_FEATURE_SIZE)

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
        "window_size": np.int32(WINDOW_SIZE),
        "input_dim": np.int32(input_dim),
        "feature_size": np.int32(INPUT_FEATURE_SIZE),
        "audio_feature_size": np.int32(audio_feature_size),
        "layer_sizes": np.array([layer1_size, layer2_size], dtype=np.int32),
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

    checksum = sha256_file(path)
    if checksum:
        checksum_path = path.with_suffix(f"{path.suffix}.sha256")
        checksum_tmp = checksum_path.with_suffix(checksum_path.suffix + ".tmp")
        checksum_tmp.write_text(f"{checksum}\n", encoding="utf-8")
        os.replace(checksum_tmp, checksum_path)
        try:
            os.chmod(checksum_path, 0o640)
        except OSError:
            pass


def _summarize_modality_counts(samples: list[Sample]) -> dict[str, int]:
    counts = dict.fromkeys(MODALITY_KEYS, 0)
    for sample in samples:
        coverage = sample.modality_coverage or {}
        for key in MODALITY_KEYS:
            value = coverage.get(key)
            if isinstance(value, (int, float)) and value > 0:
                counts[key] += 1
    return counts


def _write_training_metadata(
    model_dir: Path,
    version: str,
    samples: list[Sample],
    metadata_context: dict[str, object],
) -> None:
    counts = _summarize_modality_counts(samples)
    modalities = [key for key in MODALITY_KEYS if counts[key] > 0]
    payload = {
        "version": version,
        "modalities": modalities,
        "modality_counts": counts,
        "sample_count": len(samples),
        **metadata_context,
    }
    path = model_dir / TRAINING_METADATA_FILENAME
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    model_dir.mkdir(parents=True, exist_ok=True)
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    os.replace(tmp_path, path)
    try:
        os.chmod(path, 0o640)
    except OSError:
        pass


def _hash_training_sources(paths: list[Path], base_path: Path | None = None) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for path in paths:
        if not path.exists():
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()

        # Use relative path if base_path is provided and path is under it
        try:
            if base_path:
                path.resolve().relative_to(base_path.resolve())
                key = str(path.relative_to(base_path))
            else:
                key = path.name
        except (ValueError, AttributeError):
            key = path.name

        hashes[key] = digest
    return hashes


def _build_config_snapshot(config: TrainingConfig) -> dict[str, object]:
    return {
        "epochs": config.epochs,
        "learning_rate": config.learning_rate,
        "dropout_rate": config.dropout_rate,
        "validation_fraction": config.validation_fraction,
        "augmentations_per_sample": config.augmentations_per_sample,
        "class_weight_smoothing": config.class_weight_smoothing,
        "early_stopping_patience": config.early_stopping_patience,
        "early_stopping_min_delta": config.early_stopping_min_delta,
        "window_size": WINDOW_SIZE,
        "input_feature_size": INPUT_FEATURE_SIZE,
        "window_feature_size": WINDOW_FEATURE_SIZE,
        "layer_sizes": [MLP_LAYER1_SIZE, MLP_LAYER2_SIZE],
        "random_seed": config.random_seed,
        "sampling_mode": config.sampling_mode,
        "episodic_n_way": config.episodic_n_way,
        "episodic_k_shot": config.episodic_k_shot,
        "episodic_queries_per_class": config.episodic_queries_per_class,
        "episodic_num_episodes": config.episodic_num_episodes,
    }


def _compute_accuracy(
    X: np.ndarray,
    y: np.ndarray,
    weights: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]
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
    weights: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
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
    weights: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
    num_classes: int
) -> list[list[int]]:
    if X.size == 0 or y.size == 0:
        return [[0]*num_classes for _ in range(num_classes)]
    w1, b1, w2, b2, w3, b3 = weights
    probs, _, _, _, _ = _forward_mlp(X, w1, b1, w2, b2, w3, b3)
    preds = np.argmax(probs, axis=1)

    cm = [[0]*num_classes for _ in range(num_classes)]
    for true_label, pred_label in zip(y, preds, strict=True):
        cm[int(true_label)][int(pred_label)] += 1
    return cm


def run_training_pipeline(
    samples: list[Sample],
    *,
    config: TrainingConfig | None = None,
    output_dir: Path | None = None,
    rng: np.random.RandomState | np.random.Generator | None = None,
    metadata_context: dict[str, object] | None = None,
) -> dict[str, object]:
    """Train global and per-profile models and return detailed metrics."""

    if not samples:
        return {"error": "No training samples found."}

    resolved_config = config or TrainingConfig()
    label_set = sorted({s.label for s in samples})
    training_version = datetime.now(timezone.utc).isoformat()
    modality_counts = _summarize_modality_counts(samples)
    modalities_used = [key for key in MODALITY_KEYS if modality_counts[key] > 0]

    # Global training
    augmentation_audit: dict[str, object] = {}
    X, y, labels, weights = dataset_to_arrays(
        samples,
        augmentations_per_sample=resolved_config.augmentations_per_sample,
        rng=rng,
        provenance_sink=augmentation_audit,
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

    if resolved_config.sampling_mode == "episodic":
        episode_idx = build_episodic_indices(
            y_train,
            n_way=resolved_config.episodic_n_way,
            k_shot=resolved_config.episodic_k_shot,
            queries_per_class=resolved_config.episodic_queries_per_class,
            num_episodes=resolved_config.episodic_num_episodes,
            rng=rng,
        )
        if episode_idx.size > 0:
            X_train = X_train[episode_idx]
            y_train = y_train[episode_idx]
            w_train = w_train[episode_idx]
            augmentation_audit["episodic_sampling"] = {
                "enabled": True,
                "n_way": resolved_config.episodic_n_way,
                "k_shot": resolved_config.episodic_k_shot,
                "queries_per_class": resolved_config.episodic_queries_per_class,
                "num_episodes": resolved_config.episodic_num_episodes,
                "selected_samples": int(episode_idx.size),
            }

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

    metadata_payload = metadata_context or {}
    if augmentation_audit:
        metadata_payload = {**metadata_payload, "augmentation_provenance": augmentation_audit}
    if output_dir:
        global_dir = output_dir / "global"
        save_model(global_dir / "amy_model.npz", global_best_weights, label_set, class_counts)
        _write_training_metadata(global_dir, training_version, samples, metadata_payload)

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
            profile_dir = output_dir / profile_id
            save_model(profile_dir / "amy_model.npz", p_best_weights, p_labels, p_counts)
            _write_training_metadata(profile_dir, training_version, p_samples, metadata_payload)

        p_modality_counts = _summarize_modality_counts(p_samples)
        p_modalities_used = [key for key in MODALITY_KEYS if p_modality_counts[key] > 0]

        profile_reports[profile_id] = {
            "accuracy": p_accuracy,
            "f1_score": p_f1,
            "samples": len(p_samples),
            "labels": p_labels,
            "class_counts": p_counts.tolist(),
            "modalities": p_modalities_used,
            "modality_counts": p_modality_counts,
        }

    return {
        "global": {
            "accuracy": global_accuracy,
            "f1_score": global_f1,
            "confusion_matrix": global_cm,
            "samples": len(samples),
            "labels": label_set,
            "class_counts": class_counts.tolist(),
            "modalities": modalities_used,
            "modality_counts": modality_counts,
        },
        "profiles": profile_reports,
        "timestamp": training_version
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
        "--skip-examples",
        action="store_true",
        help="Skip loading default DGS video examples from data directory",
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
    parser.add_argument(
        "--seed",
        type=int,
        help="Random seed for deterministic training",
    )

    args = parser.parse_args()

    DATA_DIR = args.data_dir
    MODELS_DIR = args.output_dir or (DATA_DIR / "models")
    seed_value = args.seed
    if seed_value is None:
        env_seed = os.environ.get("MLP_RANDOM_SEED")
        if env_seed:
            try:
                seed_value = int(env_seed)
            except ValueError:
                raise ValueError("MLP_RANDOM_SEED must be an integer") from None

    config = TrainingConfig(
        epochs=args.epochs if args.epochs is not None else EPOCHS,
        learning_rate=args.lr if args.lr is not None else LEARNING_RATE,
        dropout_rate=args.dropout if args.dropout is not None else DROPOUT_RATE,
        early_stopping_patience=args.early_stopping if args.early_stopping is not None else EARLY_STOPPING_PATIENCE,
        random_seed=seed_value,
    )

    try:
        samples, stats = build_samples_from_manifest(args.manifest, skip_examples=args.skip_examples)

        if not samples:
            print(json.dumps({"error": "No valid training samples found."}))
            return

        rng = None
        if config.random_seed is not None:
            rng = np.random.RandomState(config.random_seed)

        training_sources = _hash_training_sources([args.manifest], base_path=DATA_DIR)
        metadata_context = {
            "training_sources": training_sources,
            "config_snapshot": _build_config_snapshot(config),
            "stats": stats,
        }

        report = run_training_pipeline(
            samples,
            config=config,
            output_dir=MODELS_DIR,
            rng=rng,
            metadata_context=metadata_context,
        )
        report["stats"] = stats
        print(json.dumps(report))

    except Exception as e:
        import traceback
        LOGGER.error(f"Training pipeline failed: {e}")
        LOGGER.error(traceback.format_exc())
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
