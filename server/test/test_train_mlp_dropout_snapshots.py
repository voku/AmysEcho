"""Dropout-specific MLP snapshot regressions."""

from __future__ import annotations

import numpy as np
from train_mlp_test_utils import loss, module, small_arch


def test_dropout_best_and_final_snapshots_are_deterministic_and_trained(monkeypatch):
    small_arch(monkeypatch, feature_size=3)
    X = np.array([[-2.0, 0.0, 1.0], [-1.0, 0.0, 1.0], [1.0, 0.0, 1.0], [2.0, 0.0, 1.0]], dtype=np.float32)
    y = np.array([0, 0, 1, 1], dtype=np.int64)

    first = module.train_mlp(
        X,
        y,
        2,
        epochs=4,
        learning_rate=0.15,
        dropout_rate=0.35,
        early_stopping_patience=None,
        rng=np.random.RandomState(42),
        return_best_and_final=True,
    )
    second = module.train_mlp(
        X,
        y,
        2,
        epochs=4,
        learning_rate=0.15,
        dropout_rate=0.35,
        early_stopping_patience=None,
        rng=np.random.RandomState(42),
        return_best_and_final=True,
    )
    initialized = module.train_mlp(
        X,
        y,
        2,
        epochs=0,
        learning_rate=0.15,
        dropout_rate=0.35,
        early_stopping_patience=None,
        rng=np.random.RandomState(42),
    )

    assert first.best_epoch > 0
    assert first.final_epoch == 4
    for actual, expected in zip(first.best_weights, second.best_weights, strict=True):
        assert np.isfinite(actual).all()
        np.testing.assert_allclose(actual, expected)
    assert any(not np.allclose(actual, initial) for actual, initial in zip(first.best_weights, initialized, strict=True))


def test_dropout_validation_tracks_post_update_validation_loss(monkeypatch):
    small_arch(monkeypatch, feature_size=2)
    X = np.array([[-1.0, 1.0], [-0.5, 1.0], [0.5, 1.0], [1.0, 1.0]], dtype=np.float32)
    y = np.array([0, 0, 1, 1], dtype=np.int64)
    X_val = X.copy()
    y_val = 1 - y

    snapshot = module.train_mlp(
        X,
        y,
        2,
        epochs=5,
        learning_rate=0.4,
        dropout_rate=0.25,
        validation_data=(X_val, y_val),
        early_stopping_patience=1,
        rng=np.random.RandomState(4),
        return_best_and_final=True,
    )

    assert snapshot.best_epoch >= 1
    assert snapshot.final_epoch <= 5
    assert np.isfinite(loss(snapshot.best_weights, X_val, y_val))
    assert loss(snapshot.best_weights, X_val, y_val) <= loss(snapshot.final_weights, X_val, y_val) + 1e-6
