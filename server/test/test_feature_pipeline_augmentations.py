from __future__ import annotations

import importlib

import numpy as np


def test_temporal_augmentation_preserves_shape_and_constraints():
    feature_pipeline = importlib.import_module("amyserver_tools.feature_pipeline")

    rng = np.random.default_rng(42)
    window = rng.normal(0.0, 1.0, size=(30, 1629)).astype(np.float32)

    augmented, provenance = feature_pipeline.augment_temporal_window(window, rng=rng, mirror_safe=False)

    assert augmented.shape == window.shape
    assert 0.0 <= float(provenance["frame_drop_ratio"]) <= 1.0 - feature_pipeline.MIN_USABLE_FRAME_RATIO
    assert 0.8 <= float(provenance["speed_factor"]) <= 1.2
    assert abs(float(provenance["time_warp"])) <= feature_pipeline.QUALITY_BOUNDED_CONFIG.time_warp_strength
    assert float(provenance["landmark_jitter_std"]) <= feature_pipeline.QUALITY_BOUNDED_CONFIG.landmark_jitter_std * 3.0


def test_mirror_augmentation_requires_mirror_safe_label():
    train_mlp = importlib.import_module("amyserver_tools.train_mlp")

    sample = train_mlp.Sample(
        label="hallo",
        profile_id=None,
        landmarks=[0.1] * train_mlp.WINDOW_FEATURE_SIZE,
        mirror_safe=False,
    )

    provenance = {}
    train_mlp.dataset_to_arrays(
        [sample],
        augmentations_per_sample=4,
        rng=np.random.default_rng(1),
        provenance_sink=provenance,
    )

    entries = provenance["temporal_augmentations"]
    assert entries
    assert all(not bool(entry["mirrored"]) for entry in entries)


def test_build_episodic_indices_returns_balanced_episode_batches():
    train_mlp = importlib.import_module("amyserver_tools.train_mlp")

    y = np.array([0, 0, 1, 1, 2, 2], dtype=np.int64)
    idx = train_mlp.build_episodic_indices(
        y,
        n_way=2,
        k_shot=1,
        queries_per_class=1,
        num_episodes=3,
        rng=np.random.default_rng(7),
    )

    assert idx.ndim == 1
    assert idx.size == 12  # 3 episodes * 2 classes * (1 support + 1 query)
    assert idx.max() < y.size

    sampled_labels = y[idx].reshape(3, 4)
    for episode_labels in sampled_labels:
        unique, counts = np.unique(episode_labels, return_counts=True)
        assert unique.size == 2
        assert sorted(counts.tolist()) == [2, 2]


def test_resample_window_handles_single_target_and_empty_input_guard():
    feature_pipeline = importlib.import_module("amyserver_tools.feature_pipeline")

    window = np.ones((4, 3), dtype=np.float32)
    resampled = feature_pipeline._resample_window(window, 1)
    assert resampled.shape == (1, 3)

    empty_window = np.zeros((0, 3), dtype=np.float32)
    try:
        feature_pipeline._resample_window(empty_window, 1)
        raise AssertionError("Expected ValueError for empty window")
    except ValueError as error:
        assert "at least one frame" in str(error)
