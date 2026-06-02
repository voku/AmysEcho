"""Numerical stability coverage for large finite MLP inputs."""

from __future__ import annotations

import numpy as np
from train_mlp_test_utils import module, sample, small_arch


def test_large_finite_inputs_and_weights_remain_numerically_stable(tmp_path, monkeypatch):
    small_arch(monkeypatch, feature_size=2)
    X = np.array([[1.0e6, -1.0e6], [-1.0e6, 1.0e6], [8.0e5, -8.0e5], [-8.0e5, 8.0e5]], dtype=np.float32)
    y = np.array([0, 1, 0, 1], dtype=np.int64)
    weights = np.array([1.0e3, 5.0e3, 2.0e3, 4.0e3], dtype=np.float32)
    trained = module.train_mlp(
        X,
        y,
        2,
        epochs=3,
        learning_rate=1.0e-4,
        dropout_rate=0.0,
        sample_weights=weights,
        validation_data=(X, y),
        validation_sample_weights=weights,
        rng=np.random.RandomState(14),
    )
    probs, *_ = module._forward_mlp(X, *trained)

    assert all(np.isfinite(tensor).all() for tensor in trained)
    assert np.isfinite(probs).all()
    assert np.isfinite(module._cross_entropy_from_probs(probs, y, sample_weights=weights, weight_sum=float(weights.sum())))

    samples = [
        sample("A", [1.0e6, -1.0e6], bundle="a1", quality_weight=1.0e3),
        sample("A", [8.0e5, -8.0e5], bundle="a2", quality_weight=2.0e3),
        sample("B", [-1.0e6, 1.0e6], bundle="b1", quality_weight=5.0e3),
        sample("B", [-8.0e5, 8.0e5], bundle="b2", quality_weight=4.0e3),
    ]
    config = module.TrainingConfig(epochs=2, learning_rate=1.0e-4, validation_fraction=0.5, early_stopping_patience=None)
    module.run_training_pipeline(samples, config=config, output_dir=tmp_path, rng=np.random.RandomState(14))
    with np.load(tmp_path / "global" / "amy_model.npz", allow_pickle=False) as data:
        for key in data.files:
            if data[key].dtype.kind in "fiu":
                assert np.isfinite(data[key]).all()
