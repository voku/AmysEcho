import numpy as np
import pytest

from amyserver_tools.config_constants import INPUT_FEATURE_SIZE, WINDOW_SIZE
from amyserver_tools.sliding_window import create_sliding_windows, normalize_frame_sequence


def _make_frame(value: float) -> np.ndarray:
    return np.full((INPUT_FEATURE_SIZE,), value, dtype=np.float32)


def test_normalize_frame_sequence_pads_short_sequences_with_last_frame_and_weight():
    frames = [_make_frame(1.0), _make_frame(2.0), _make_frame(3.0)]
    weights = [0.1, 0.2, 0.3]

    normalized_frames, normalized_weights = normalize_frame_sequence(
        frames,
        target_frames=WINDOW_SIZE,
        frame_weights=weights,
    )

    assert normalized_frames.shape == (WINDOW_SIZE, INPUT_FEATURE_SIZE)
    assert normalized_weights.shape == (WINDOW_SIZE,)
    assert float(normalized_frames[0, 0]) == pytest.approx(1.0)
    assert float(normalized_frames[2, 0]) == pytest.approx(3.0)
    assert float(normalized_frames[-1, 0]) == pytest.approx(3.0)
    assert float(normalized_weights[-1]) == pytest.approx(0.3)


def test_normalize_frame_sequence_truncates_head_and_tail():
    frames = [_make_frame(float(i)) for i in range(1, 9)]

    head_frames, head_weights = normalize_frame_sequence(
        frames,
        target_frames=4,
        truncate_strategy="head",
    )
    tail_frames, tail_weights = normalize_frame_sequence(
        frames,
        target_frames=4,
        truncate_strategy="tail",
    )

    assert head_frames.shape == (4, INPUT_FEATURE_SIZE)
    assert tail_frames.shape == (4, INPUT_FEATURE_SIZE)
    assert float(head_frames[0, 0]) == pytest.approx(1.0)
    assert float(head_frames[-1, 0]) == pytest.approx(4.0)
    assert float(tail_frames[0, 0]) == pytest.approx(5.0)
    assert float(tail_frames[-1, 0]) == pytest.approx(8.0)
    assert float(head_weights[0]) == pytest.approx(1.0)
    assert float(tail_weights[-1]) == pytest.approx(1.0)


def test_normalize_frame_sequence_rejects_mismatched_weight_length():
    frames = [_make_frame(1.0), _make_frame(2.0)]

    with pytest.raises(ValueError, match="frame_weights length"):
        normalize_frame_sequence(
            frames,
            target_frames=WINDOW_SIZE,
            frame_weights=[0.5],
        )


def test_create_sliding_windows_keeps_short_clip_support_via_padding():
    frames = [_make_frame(0.5), _make_frame(0.7), _make_frame(0.9)]
    context = {"profile_id": "profile-1", "source_bundle_id": "bundle-1"}

    samples = create_sliding_windows(
        frame_vectors=frames,
        label="hilfe",
        context=context,
    )

    assert len(samples) == 1
    sample = samples[0]
    assert sample.label == "hilfe"
    assert sample.profile_id == "profile-1"
    assert sample.source_bundle_id == "bundle-1"
    assert len(sample.landmarks) == WINDOW_SIZE * INPUT_FEATURE_SIZE
    # First frame and padded last frame should both be present in flattened output
    assert sample.landmarks[0] == pytest.approx(0.5)
    assert sample.landmarks[-1] == pytest.approx(0.9)


def test_create_sliding_windows_supports_relative_delta_mode():
    frame_a = np.zeros((INPUT_FEATURE_SIZE,), dtype=np.float32)
    frame_b = np.ones((INPUT_FEATURE_SIZE,), dtype=np.float32)
    frame_c = np.full((INPUT_FEATURE_SIZE,), 3.0, dtype=np.float32)
    context = {"profile_id": "profile-1", "source_bundle_id": "bundle-relative"}

    samples = create_sliding_windows(
        frame_vectors=[frame_a, frame_b, frame_c],
        label="mehr",
        context=context,
        feature_mode="relative_delta",
    )

    assert len(samples) == 1
    sample = samples[0]
    reshaped = np.array(sample.landmarks, dtype=np.float32).reshape((WINDOW_SIZE, INPUT_FEATURE_SIZE))
    assert float(reshaped[0, 0]) == pytest.approx(0.0)
    assert float(reshaped[1, 0]) == pytest.approx(1.0)
    assert float(reshaped[2, 0]) == pytest.approx(2.0)
    assert float(reshaped[-1, 0]) == pytest.approx(0.0)


def test_create_sliding_windows_rejects_unknown_feature_mode():
    frames = [_make_frame(0.5), _make_frame(0.7)]

    with pytest.raises(ValueError, match="feature_mode"):
        create_sliding_windows(
            frame_vectors=frames,
            label="hilfe",
            context={},
            feature_mode="invalid_mode",
        )


def test_relative_delta_computed_per_window_not_globally():
    """Verify that relative_delta is computed independently per extracted window,
    so that each window's first row is always zero.  This matches the web
    inference rolling-buffer behaviour."""
    from amyserver_tools.config_constants import WINDOW_STRIDE

    # Create WINDOW_SIZE + WINDOW_STRIDE distinct frames so we get 2 windows
    num_frames = WINDOW_SIZE + WINDOW_STRIDE
    frames = [np.full((INPUT_FEATURE_SIZE,), float(i), dtype=np.float32) for i in range(num_frames)]
    context = {"profile_id": "p1", "source_bundle_id": "b1"}

    samples = create_sliding_windows(
        frame_vectors=frames,
        label="test",
        context=context,
        feature_mode="relative_delta",
    )

    assert len(samples) >= 2, f"Expected at least 2 windows, got {len(samples)}"

    for idx, sample in enumerate(samples):
        reshaped = np.array(sample.landmarks, dtype=np.float32).reshape(
            (WINDOW_SIZE, INPUT_FEATURE_SIZE)
        )
        # First row of every window must be zero (per-window delta)
        assert float(reshaped[0, 0]) == pytest.approx(0.0), (
            f"Window {idx}: first-row delta should be 0.0, got {reshaped[0, 0]}"
        )
        # Second row should be the delta between consecutive frames (always 1.0)
        assert float(reshaped[1, 0]) == pytest.approx(1.0), (
            f"Window {idx}: second-row delta should be 1.0, got {reshaped[1, 0]}"
        )
