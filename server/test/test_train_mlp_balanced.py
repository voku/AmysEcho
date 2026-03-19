from __future__ import annotations

import importlib

import numpy as np


def test_compute_sample_weights_inverse_frequency():
    module = importlib.import_module("amyserver_tools.train_mlp")

    y = np.array([0, 0, 1, 2, 2, 2], dtype=np.int64)
    weights = module.compute_sample_weights(y, smoothing=0.0)

    assert weights.shape == y.shape
    # Class 1 appears once, so it should receive the highest weight after normalization.
    assert weights[2] > weights[0]
    assert np.isclose(np.mean(weights), 1.0)


def test_dataset_to_arrays_includes_augmentations(monkeypatch):
    module = importlib.import_module("amyserver_tools.train_mlp")
    from amyserver_tools.train_mlp import WINDOW_FEATURE_SIZE

    # Sample landmarks must match WINDOW_FEATURE_SIZE (48,870)
    sample = module.Sample(label="HALLO", profile_id=None, landmarks=[0.0] * WINDOW_FEATURE_SIZE)

    # Use deterministic jitter to make the test repeatable.
    rng = np.random.default_rng(0)
    provenance = {}
    X, y, labels, weights, groups = module.dataset_to_arrays(
        [sample],
        augmentations_per_sample=2,
        rng=rng,
        provenance_sink=provenance,
    )

    assert X.shape[0] == provenance["augmented_sample_count"] + 1
    assert y.tolist() == [0] * X.shape[0]
    assert labels == ["HALLO"]
    assert weights.shape[0] == X.shape[0]
    assert groups.tolist() == ["sample:0"] * X.shape[0]
    assert provenance["augmented_sample_count"] >= 2


def test_validation_loss_guides_best_weights():
    module = importlib.import_module("amyserver_tools.train_mlp")

    rng = np.random.RandomState(0)
    X = rng.randn(4, 6)
    y = np.array([0, 1, 0, 1], dtype=np.int64)

    X_val = X.copy()
    y_val = np.array([1, 0, 1, 0], dtype=np.int64)  # inverted labels raise validation loss after updates

    snapshot = module.train_mlp(
        X,
        y,
        2,
        epochs=5,
        learning_rate=5.0,
        dropout_rate=0.0,
        early_stopping_patience=2,
        early_stopping_min_delta=0.0,
        validation_data=(X_val, y_val),
        rng=np.random.RandomState(1),
        return_best_and_final=True,
    )

    best_weights = snapshot.best_weights
    final_weights = snapshot.final_weights

    def _loss(weights):
        w1, b1, w2, b2, w3, b3 = weights
        z1 = np.dot(X_val, w1) + b1
        a1 = module.relu(z1)
        z2 = np.dot(a1, w2) + b2
        a2 = module.relu(z2)
        z3 = np.dot(a2, w3) + b3
        probs = module.softmax(z3)
        epsilon = getattr(module, "LOSS_EPSILON", np.spacing(1.0))
        p = np.clip(probs[np.arange(len(y_val)), y_val], epsilon, 1.0 - epsilon)
        return float(np.sum(-np.log(p)) / len(y_val))

    assert _loss(best_weights) < _loss(final_weights)
