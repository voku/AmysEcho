"""Validation sample-weight behaviour for MLP best-weight selection."""

from __future__ import annotations

import numpy as np
import pytest
from train_mlp_test_utils import module, small_arch


def test_weighted_validation_loss_can_choose_different_best_epoch(monkeypatch):
    small_arch(monkeypatch, feature_size=1)
    X = np.array([[-2.0], [-1.0], [1.0], [2.0]], dtype=np.float32)
    y = np.array([0, 0, 1, 1], dtype=np.int64)
    X_val = np.array([[-1.5], [1.5], [8.0]], dtype=np.float32)
    y_val = np.array([0, 1, 0], dtype=np.int64)

    unweighted = module.train_mlp(
        X,
        y,
        2,
        epochs=8,
        learning_rate=0.5,
        dropout_rate=0.0,
        validation_data=(X_val, y_val),
        early_stopping_patience=None,
        rng=np.random.RandomState(1),
        return_best_and_final=True,
    )
    weighted = module.train_mlp(
        X,
        y,
        2,
        epochs=8,
        learning_rate=0.5,
        dropout_rate=0.0,
        validation_data=(X_val, y_val),
        validation_sample_weights=np.array([0.1, 0.1, 10.0], dtype=np.float32),
        early_stopping_patience=None,
        rng=np.random.RandomState(1),
        return_best_and_final=True,
    )

    assert unweighted.best_epoch != weighted.best_epoch


@pytest.mark.parametrize("bad_weights", [np.array([1.0], dtype=np.float32), np.array(1.0, dtype=np.float32)])
def test_invalid_validation_weight_shapes_fall_back_safely(monkeypatch, bad_weights):
    small_arch(monkeypatch, feature_size=2)
    X = np.array([[-1.0, 0.0], [1.0, 0.0]], dtype=np.float32)
    y = np.array([0, 1], dtype=np.int64)
    snapshot = module.train_mlp(
        X,
        y,
        2,
        epochs=2,
        learning_rate=0.1,
        dropout_rate=0.0,
        validation_data=(X, y),
        validation_sample_weights=bad_weights,
        rng=np.random.RandomState(2),
        return_best_and_final=True,
    )

    assert snapshot.best_epoch > 0
    assert all(np.isfinite(tensor).all() for tensor in snapshot.best_weights)


def test_zero_sum_validation_weights_fall_back_to_unweighted_loss(monkeypatch):
    small_arch(monkeypatch, feature_size=2)
    X = np.array([[-1.0, 0.0], [1.0, 0.0]], dtype=np.float32)
    y = np.array([0, 1], dtype=np.int64)
    common = {
        "output_size": 2,
        "epochs": 3,
        "learning_rate": 0.1,
        "dropout_rate": 0.0,
        "validation_data": (X, y),
        "early_stopping_patience": None,
        "return_best_and_final": True,
    }

    unweighted = module.train_mlp(X, y, rng=np.random.RandomState(3), **common)
    zero_weighted = module.train_mlp(
        X,
        y,
        validation_sample_weights=np.zeros(2, dtype=np.float32),
        rng=np.random.RandomState(3),
        **common,
    )

    assert zero_weighted.best_epoch == unweighted.best_epoch
    for actual, expected in zip(zero_weighted.best_weights, unweighted.best_weights, strict=True):
        np.testing.assert_allclose(actual, expected)
