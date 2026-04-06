#!/usr/bin/env python3
# mypy: disable-error-code=no-redef
"""
Sliding Window Generator for AmysEcho Temporal Pipeline
"""

from dataclasses import dataclass
from typing import Any

import numpy as np

try:
    from .config_constants import INPUT_FEATURE_SIZE, WINDOW_SIZE, WINDOW_STRIDE
except ImportError:
    from config_constants import INPUT_FEATURE_SIZE, WINDOW_SIZE, WINDOW_STRIDE


@dataclass
class Sample:
    """
    Training sample produced from a temporal window of frames.
    """
    label: str
    profile_id: str | None
    landmarks: list[float]  # Flattened temporal window
    pose_landmarks: list[list[float]] | None = None  # Deprecated
    face_landmarks: list[list[float]] | None = None  # Deprecated
    hand_focus: str | None = None
    variation_cluster_id: str | None = None
    variation_diversity: float | None = None
    canonical_templates_count: int | None = None
    recording: dict[str, Any] | None = None
    timing_stats: dict[str, float] | None = None
    modality_coverage: dict[str, float] | None = None
    quality_weight: float = 1.0
    mirror_safe: bool = False
    source_bundle_id: str | None = None



def create_sliding_windows(
    frame_vectors: list[np.ndarray],
    label: str,
    context: dict[str, Any],
    frame_weights: list[float] | None = None,
    feature_mode: str = "absolute",
) -> list[Sample]:
    """
    Convert sequence of normalized frame vectors into sliding window samples.
    """

    if not frame_vectors:
        return []

    arr, weights_arr = normalize_frame_sequence(
        frame_vectors,
        target_frames=WINDOW_SIZE,
        frame_weights=frame_weights,
        truncate_strategy="none",
    )
    seq_len, feature_dim = arr.shape

    if feature_dim != INPUT_FEATURE_SIZE:
        raise ValueError(
            f"Expected frame vectors of size {INPUT_FEATURE_SIZE}, got {feature_dim}"
        )

    if feature_mode not in {"absolute", "relative_delta"}:
        raise ValueError("feature_mode must be one of: absolute, relative_delta")

    # ========================================================================
    # STEP 2: GENERATE SLIDING WINDOWS
    # ========================================================================

    samples = []
    num_windows = (seq_len - WINDOW_SIZE) // WINDOW_STRIDE + 1

    for i in range(num_windows):
        start_idx = i * WINDOW_STRIDE
        end_idx = start_idx + WINDOW_SIZE

        # Extract window: (30, 1629)
        window = arr[start_idx:end_idx, :]

        # Apply relative_delta per-window so that each window's first row is
        # always zero – matching the web inference rolling-buffer behaviour.
        if feature_mode == "relative_delta":
            deltas = np.zeros_like(window)
            deltas[1:, :] = window[1:, :] - window[:-1, :]
            window = deltas

        # Flatten: (48,870,)
        flat_vector = window.flatten()

        # Convert to Python list (for JSON serialization)
        flat_list = flat_vector.tolist()

        # Aggregate weights for this window (simple average)
        window_weight = float(np.mean(weights_arr[start_idx:end_idx]))

        # ====================================================================
        # STEP 3: CREATE SAMPLE OBJECT
        # ====================================================================

        samples.append(Sample(
            label=label,
            profile_id=context.get('profile_id'),
            landmarks=flat_list,
            pose_landmarks=None,
            face_landmarks=None,
            hand_focus=context.get('hand_focus'),
            variation_cluster_id=context.get('variation_cluster_id'),
            variation_diversity=context.get('variation_diversity'),
            canonical_templates_count=context.get('canonical_templates_count'),
            recording=context.get('recording'),
            timing_stats=context.get('timing_stats'),
            modality_coverage=context.get('modality_coverage'),
            quality_weight=window_weight,
            mirror_safe=bool(context.get('mirror_safe', False)),
            source_bundle_id=context.get('source_bundle_id'),
        ))

    return samples


def normalize_frame_sequence(
    frame_vectors: list[np.ndarray],
    target_frames: int,
    frame_weights: list[float] | None = None,
    truncate_strategy: str = "none",
) -> tuple[np.ndarray, np.ndarray]:
    """
    Normalize a frame sequence to a fixed length.

    - Pads short sequences by repeating the last frame/weight.
    - Optionally truncates long sequences via `truncate_strategy`:
      - "none": keep all frames (default)
      - "head": keep the first `target_frames`
      - "tail": keep the last `target_frames`
    """

    if target_frames < 1:
        raise ValueError("target_frames must be >= 1")
    if not frame_vectors:
        raise ValueError("frame_vectors must contain at least one frame")

    arr = np.array(frame_vectors, dtype=np.float32)
    if arr.ndim != 2:
        raise ValueError("frame_vectors must resolve to a 2D array [frames, features]")
    seq_len, feature_dim = arr.shape

    if feature_dim != INPUT_FEATURE_SIZE:
        raise ValueError(
            f"Expected frame vectors of size {INPUT_FEATURE_SIZE}, got {feature_dim}"
        )

    if frame_weights is None:
        weights_arr = np.ones(seq_len, dtype=np.float32)
    else:
        weights_arr = np.array(frame_weights, dtype=np.float32)
        if weights_arr.shape[0] != seq_len:
            raise ValueError(
                "frame_weights length must equal number of input frames"
            )

    if seq_len < target_frames:
        pad_qty = target_frames - seq_len
        last_frame = arr[-1:, :]
        last_weight = weights_arr[-1]
        arr = np.vstack([arr, np.repeat(last_frame, pad_qty, axis=0)])
        weights_arr = np.concatenate([weights_arr, np.repeat(last_weight, pad_qty)])
        return arr, weights_arr

    if seq_len > target_frames and truncate_strategy != "none":
        if truncate_strategy == "head":
            return arr[:target_frames, :], weights_arr[:target_frames]
        if truncate_strategy == "tail":
            return arr[-target_frames:, :], weights_arr[-target_frames:]
        raise ValueError(
            "truncate_strategy must be one of: none, head, tail"
        )

    return arr, weights_arr
