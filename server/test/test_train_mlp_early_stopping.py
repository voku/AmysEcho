"""Regression tests for early stopping in the MLP trainer."""

from __future__ import annotations

from importlib import import_module
from pathlib import Path

import numpy as np
import pytest


def _loss(module, X: np.ndarray, y: np.ndarray, weights):
    w1, b1, w2, b2, w3, b3 = weights
    z1 = np.dot(X, w1) + b1
    a1 = module.relu(z1)
    z2 = np.dot(a1, w2) + b2
    a2 = module.relu(z2)
    z3 = np.dot(a2, w3) + b3
    probs = module.softmax(z3)
    epsilon = getattr(module, "LOSS_EPSILON", np.spacing(1.0))
    p = np.clip(probs[np.arange(len(y)), y], epsilon, 1.0 - epsilon)
    log_probs = -np.log(p)
    return float(np.sum(log_probs) / len(y))


@pytest.mark.parametrize(
    "rng_factory",
    [
        lambda seed: np.random.RandomState(seed),
        lambda seed: np.random.default_rng(seed),
    ],
)
def test_early_stopping_persists_best_weights(tmp_path, rng_factory):
    """Ensure the saved model contains the lowest-loss parameters."""

    # Import the trainer module locally so environment tweaks from other tests do not leak.
    module = import_module("amyserver_tools.train_mlp")

    rng_data = np.random.RandomState(0)
    X = rng_data.randn(6, 5)
    y = np.array([0, 1, 2, 0, 1, 2], dtype=np.int64)

    epochs = 8
    learning_rate = 2.0  # Large enough to destabilize after a real post-update improvement.

    rng_best = rng_factory(0)
    result_with_best_tracking = module.train_mlp(
        X,
        y,
        3,
        epochs=epochs,
        learning_rate=learning_rate,
        dropout_rate=0.0,
        early_stopping_patience=None,
        early_stopping_min_delta=0.0,
        rng=rng_best,
        return_best_and_final=True,
    )

    best_weights = result_with_best_tracking.best_weights

    rng_last = rng_factory(0)
    result_without_early_stop = module.train_mlp(
        X,
        y,
        3,
        epochs=epochs,
        learning_rate=learning_rate,
        dropout_rate=0.0,
        early_stopping_patience=None,
        early_stopping_min_delta=0.0,
        rng=rng_last,
        return_best_and_final=True,
    )

    final_epoch_weights = result_without_early_stop.final_weights

    best_loss = _loss(module, X, y, best_weights)
    final_loss = _loss(module, X, y, final_epoch_weights)

    assert best_loss < final_loss or np.isnan(final_loss)

    labels = ["eins", "zwei", "drei"]
    model_path = Path(tmp_path) / "amy_model.npz"
    module.save_model(model_path, best_weights, labels)

    with np.load(model_path, allow_pickle=False) as data:
        saved_weights = (
            data["w1"].T,
            data["b1"],
            data["w2"].T,
            data["b2"],
            data["w3"].T,
            data["b3"],
        )

    for saved, expected in zip(saved_weights, best_weights, strict=True):
        np.testing.assert_allclose(saved, expected)

    # Verify that at least one tensor differs from the degraded final epoch snapshot.
    assert any(
        not np.allclose(saved, final)
        for saved, final in zip(saved_weights, final_epoch_weights, strict=True)
    )


def test_single_epoch_training_returns_updated_weights():
    """Regression: one-epoch training must not return the untouched initializer."""

    module = import_module("amyserver_tools.train_mlp")

    X = np.array([[-2.0], [-1.0], [1.0], [2.0]], dtype=np.float32)
    y = np.array([0, 0, 1, 1], dtype=np.int64)

    trained = module.train_mlp(
        X,
        y,
        2,
        epochs=1,
        learning_rate=0.1,
        dropout_rate=0.0,
        early_stopping_patience=None,
        rng=np.random.RandomState(7),
    )
    initialized = module.train_mlp(
        X,
        y,
        2,
        epochs=0,
        learning_rate=0.1,
        dropout_rate=0.0,
        early_stopping_patience=None,
        rng=np.random.RandomState(7),
    )

    assert any(
        not np.allclose(after_training, before_training)
        for after_training, before_training in zip(trained, initialized, strict=True)
    )
    assert _loss(module, X, y, trained) < _loss(module, X, y, initialized)


def test_training_pipeline_persists_optimizer_updated_global_model(tmp_path, monkeypatch):
    """Regression: the full pipeline must save post-update weights, not initializer weights."""

    module = import_module("amyserver_tools.train_mlp")

    monkeypatch.setattr(module, "WINDOW_FEATURE_SIZE", 2)
    monkeypatch.setattr(module, "WINDOW_SIZE", 1)
    monkeypatch.setattr(module, "INPUT_FEATURE_SIZE", 2)
    monkeypatch.setattr(module, "MLP_LAYER1_SIZE", 8)
    monkeypatch.setattr(module, "MLP_LAYER2_SIZE", 4)

    samples = []
    for index in range(100):
        samples.append(
            module.Sample(
                label="ALPHA",
                profile_id=None,
                landmarks=[1.0, 0.0],
                source_bundle_id=f"alpha-{index}",
            )
        )
        samples.append(
            module.Sample(
                label="BETA",
                profile_id=None,
                landmarks=[0.0, 1.0],
                source_bundle_id=f"beta-{index}",
            )
        )

    config = module.TrainingConfig(
        epochs=1,
        learning_rate=0.1,
        dropout_rate=0.0,
        validation_fraction=0.0,
        augmentations_per_sample=0,
        early_stopping_patience=None,
    )

    X, y, labels, weights, _groups = module.dataset_to_arrays(samples, min_samples_target=100)
    initialized = module.train_mlp(
        X,
        y,
        len(labels),
        config=module.replace(config, epochs=0),
        sample_weights=weights,
        rng=np.random.RandomState(11),
    )

    report = module.run_training_pipeline(
        samples,
        config=config,
        output_dir=tmp_path,
        rng=np.random.RandomState(11),
    )

    assert report["global"]["samples"] == len(samples)

    model_path = tmp_path / "global" / "amy_model.npz"
    with np.load(model_path, allow_pickle=False) as data:
        saved_weights = (
            data["w1"].T,
            data["b1"],
            data["w2"].T,
            data["b2"],
            data["w3"].T,
            data["b3"],
        )

    assert any(
        not np.allclose(saved, before_training)
        for saved, before_training in zip(saved_weights, initialized, strict=True)
    )
    assert _loss(module, X, y, saved_weights) < _loss(module, X, y, initialized)
