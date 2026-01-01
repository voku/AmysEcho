#!/usr/bin/env python3
"""
Complete Data Pipeline Integration
"""

from typing import Any

import numpy as np
from config_constants import (
    NULL_CLASS_LABEL,
    NULL_SAMPLES_PER_CLIP,
    WINDOW_FEATURE_SIZE,
    WINDOW_SIZE,
)
from frame_normalization import _normalize_frame
from sliding_window import Sample, create_sliding_windows


def process_clip_to_samples(
    frames: list[dict[str, Any]],
    label: str,
    context: dict[str, Any],
    generate_null: bool = True
) -> list[Sample]:
    """
    Process raw clip into temporal window training samples.
    """

    if not frames:
        return []

    # ========================================================================
    # STEP 1: NORMALIZE EACH FRAME
    # ========================================================================

    normalized_frames = []

    for frame in frames:
        landmarks = frame.get('landmarks')
        pose = frame.get('poseLandmarks')
        face = frame.get('faceLandmarks')

        vec = _normalize_frame(landmarks, pose, face)
        if vec is not None:
            normalized_frames.append(vec)

    if not normalized_frames:
        return []

    # ========================================================================
    # STEP 2: GENERATE "_NULL_" CLASS (BACKGROUND)
    # ========================================================================

    samples = []

    if generate_null and len(normalized_frames) >= WINDOW_SIZE * 2:
        # Use first 60 frames to get 2 NULL windows
        null_window = normalized_frames[:WINDOW_SIZE * 2]
        null_samples = create_sliding_windows(
            null_window,
            NULL_CLASS_LABEL,
            context
        )
        # Limit to 2 samples
        samples.extend(null_samples[:NULL_SAMPLES_PER_CLIP])

    elif generate_null and len(normalized_frames) >= WINDOW_SIZE:
        # Short clip: just 1 NULL sample
        null_window = normalized_frames[:WINDOW_SIZE]
        null_samples = create_sliding_windows(
            null_window,
            NULL_CLASS_LABEL,
            context
        )
        samples.extend(null_samples[:1])

    # ========================================================================
    # STEP 3: GENERATE SIGN CLASS SAMPLES
    # ========================================================================

    sign_samples = create_sliding_windows(
        normalized_frames,
        label,
        context
    )
    samples.extend(sign_samples)

    return samples


def dataset_to_arrays(
    samples: list[Sample]
) -> tuple[np.ndarray, np.ndarray, list[str], np.ndarray]:
    """
    Convert Sample objects to training arrays.
    """

    if not samples:
        return (
            np.zeros((0, WINDOW_FEATURE_SIZE), dtype=np.float32),
            np.zeros((0,), dtype=np.int64),
            [],
            np.zeros((0,), dtype=np.float32),
        )

    # Create label mapping
    label_set = sorted({sample.label for sample in samples})
    label_to_idx = {label: idx for idx, label in enumerate(label_set)}

    X_list: list[np.ndarray] = []
    y_list: list[int] = []
    weight_list: list[float] = []

    for sample in samples:
        # Sample.landmarks is already normalized window vector
        features = np.array(sample.landmarks, dtype=np.float32)

        # Validate
        if features.size != WINDOW_FEATURE_SIZE:
            print(f"Warning: Wrong size {features.size}, expected {WINDOW_FEATURE_SIZE}")
            continue

        X_list.append(features)
        y_list.append(label_to_idx[sample.label])
        weight_list.append(1.0)  # Uniform weighting (could enhance)

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


def test_data_pipeline():
    """Test complete pipeline."""

    print("Testing Data Pipeline...")

    # Create 60 frames
    frames = []
    for i in range(60):
        frames.append({
            'landmarks': [[0.5 + i*0.001, 0.5, 0.0] for _ in range(42)],
            'poseLandmarks': [[0.5, 0.5, 0.0, 1.0] for _ in range(33)],
            'faceLandmarks': [[0.5, 0.5, 0.0] for _ in range(468)]
        })

    # Test 1: Process with NULL
    samples = process_clip_to_samples(frames, "TEST", {}, generate_null=True)

    null_count = sum(1 for s in samples if s.label == NULL_CLASS_LABEL)
    sign_count = sum(1 for s in samples if s.label == "TEST")

    assert null_count == 2, f"Expected 2 NULL samples, got {null_count}"
    assert sign_count == 31, f"Expected 31 TEST samples, got {sign_count}"
    print(f"  ✓ Clip processing ({null_count} NULL + {sign_count} sign)")

    # Test 2: Convert to arrays
    X, _y, labels, _weights = dataset_to_arrays(samples)

    assert X.shape == (33, WINDOW_FEATURE_SIZE)
    assert len(labels) == 2  # TEST and _NULL_
    assert NULL_CLASS_LABEL in labels
    print(f"  ✓ Array conversion (shape: {X.shape}, labels: {labels})")

    # Test 3: Without NULL
    samples_no_null = process_clip_to_samples(frames, "TEST", {}, generate_null=False)
    null_count = sum(1 for s in samples_no_null if s.label == NULL_CLASS_LABEL)
    assert null_count == 0
    print("  ✓ NULL generation can be disabled")

    print("All tests passed! ✓\n")

if __name__ == "__main__":
    test_data_pipeline()
