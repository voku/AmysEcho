"""Regression tests for early stopping in the MLP trainer."""

from __future__ import annotations

import importlib
from pathlib import Path

import numpy as np


def _loss(module, X: np.ndarray, y: np.ndarray, weights):
    w1, b1, w2, b2 = weights
    z1 = np.dot(X, w1) + b1
    a1 = module.relu(z1)
    z2 = np.dot(a1, w2) + b2
    probs = module.softmax(z2)
    p = np.clip(probs[np.arange(len(y)), y], 1e-12, 1.0)
    log_probs = -np.log(p)
    return float(np.sum(log_probs) / len(y))


def _train_without_snapshot(module, X, y, hidden_size, output_size, epochs, learning_rate, rng):
    """Run the vanilla training loop to capture the final-epoch weights."""

    input_size = X.shape[1]
    num_samples = X.shape[0]

    w1 = rng.randn(input_size, hidden_size) * 0.01
    b1 = np.zeros(hidden_size)
    w2 = rng.randn(hidden_size, output_size) * 0.01
    b2 = np.zeros(output_size)

    for _ in range(epochs):
        z1 = np.dot(X, w1) + b1
        a1 = module.relu(z1)
        z2 = np.dot(a1, w2) + b2
        probs = module.softmax(z2)

        dz2 = probs
        dz2[np.arange(num_samples), y] -= 1
        dz2 /= num_samples

        dw2 = np.dot(a1.T, dz2)
        db2 = np.sum(dz2, axis=0)

        da1 = np.dot(dz2, w2.T)
        dz1 = da1 * module.relu_derivative(z1)

        dw1 = np.dot(X.T, dz1)
        db1 = np.sum(dz1, axis=0)

        w1 -= learning_rate * dw1
        b1 -= learning_rate * db1
        w2 -= learning_rate * dw2
        b2 -= learning_rate * db2

    return w1, b1, w2, b2


def test_early_stopping_persists_best_weights(tmp_path):
    """Ensure the saved model contains the lowest-loss parameters."""

    # Reload the module so potential environment tweaks in other tests do not leak.
    module = importlib.import_module("amyserver_tools.train_mlp")
    module = importlib.reload(module)

    rng_data = np.random.RandomState(0)
    X = rng_data.randn(4, 10)
    y = np.array([0, 1, 2, 1], dtype=np.int64)

    patience = 1
    epochs = 5
    learning_rate = 10.0  # Large value to intentionally destabilize training after the first epoch.

    rng_best = np.random.RandomState(0)
    best_weights = module.train_mlp(
        X,
        y,
        3,
        hidden_size=4,
        epochs=epochs,
        learning_rate=learning_rate,
        dropout_rate=0.0,
        early_stopping_patience=patience,
        early_stopping_min_delta=0.0,
        rng=rng_best,
    )

    rng_last = np.random.RandomState(0)
    final_epoch_weights = _train_without_snapshot(
        module,
        X,
        y,
        hidden_size=4,
        output_size=3,
        epochs=epochs,
        learning_rate=learning_rate,
        rng=rng_last,
    )

    best_loss = _loss(module, X, y, best_weights)
    final_loss = _loss(module, X, y, final_epoch_weights)

    assert best_loss < final_loss

    labels = ["eins", "zwei", "drei"]
    model_path = Path(tmp_path) / "amy_model.npz"
    module.save_model(model_path, best_weights, labels)

    with np.load(model_path, allow_pickle=False) as data:
        saved_weights = (
            data["w1"].T,
            data["b1"],
            data["w2"].T,
            data["b2"],
        )

    for saved, expected in zip(saved_weights, best_weights, strict=True):
        np.testing.assert_allclose(saved, expected)

    # Verify that at least one tensor differs from the degraded final epoch snapshot.
    assert any(
        not np.allclose(saved, final)
        for saved, final in zip(saved_weights, final_epoch_weights, strict=True)
    )
