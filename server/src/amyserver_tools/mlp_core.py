"""Core numerical helpers for Amy's MLP trainer.

This module intentionally contains the small, reusable pieces of the MLP
workflow so the manifest/pipeline orchestration in ``train_mlp.py`` can stay
focused on data loading, reporting, and persistence.
"""

from __future__ import annotations

import numpy as np

try:
    from .config_constants import LOSS_EPSILON
except ImportError:  # pragma: no cover - script-mode fallback
    from config_constants import LOSS_EPSILON

WeightTuple = tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]


def relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(0, x)


def relu_derivative(x: np.ndarray) -> np.ndarray:
    return np.where(x > 0, 1, 0)


def softmax(x: np.ndarray) -> np.ndarray:
    e_x = np.exp(x - np.max(x, axis=1, keepdims=True))
    return e_x / np.sum(e_x, axis=1, keepdims=True)


def forward_mlp(
    X: np.ndarray,
    w1: np.ndarray,
    b1: np.ndarray,
    w2: np.ndarray,
    b2: np.ndarray,
    w3: np.ndarray,
    b3: np.ndarray,
    dropout_mask1: np.ndarray | None = None,
    dropout_mask2: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Run the three-layer MLP forward pass with optional dropout masks."""

    z1 = np.dot(X, w1) + b1
    a1 = relu(z1)
    if dropout_mask1 is not None:
        a1 *= dropout_mask1

    z2 = np.dot(a1, w2) + b2
    a2 = relu(z2)
    if dropout_mask2 is not None:
        a2 *= dropout_mask2

    z3 = np.dot(a2, w3) + b3
    probs = softmax(z3)

    return probs, a1, a2, z1, z2


def cross_entropy_from_probs(
    probs: np.ndarray,
    y: np.ndarray,
    *,
    sample_weights: np.ndarray | None = None,
    weight_sum: float | None = None,
) -> float:
    """Return cross-entropy for precomputed probabilities and optional weights."""

    p = np.clip(probs[np.arange(y.shape[0]), y], LOSS_EPSILON, 1.0 - LOSS_EPSILON)
    losses = -np.log(p)
    if sample_weights is not None and weight_sum:
        return float(np.sum(losses * sample_weights) / weight_sum)
    return float(np.sum(losses) / y.shape[0])


def resolve_loss_weights(
    sample_weights: np.ndarray | None,
    expected_length: int,
) -> tuple[np.ndarray | None, float]:
    """Return valid 1-D positive-sum weights or an unweighted fallback."""

    fallback_sum = float(expected_length)
    if sample_weights is None:
        return None, fallback_sum

    candidate = np.asarray(sample_weights, dtype=np.float32)
    if candidate.ndim != 1 or candidate.shape[0] != expected_length or candidate.size == 0:
        return None, fallback_sum

    weight_sum = float(np.sum(candidate))
    if weight_sum <= 0:
        return None, fallback_sum

    return candidate, weight_sum


def sample_standard_normal(
    rng: np.random.RandomState | np.random.Generator | object,
    shape: tuple[int, ...],
) -> np.ndarray:
    """Sample standard-normal values across supported NumPy RNG APIs."""

    if isinstance(rng, (np.random.Generator, np.random.RandomState)):
        return rng.standard_normal(size=shape)
    if hasattr(rng, "randn"):
        return rng.randn(*shape)
    return np.random.standard_normal(size=shape)


def sample_uniform(
    rng: np.random.RandomState | np.random.Generator | object,
    shape: tuple[int, ...],
) -> np.ndarray:
    """Sample uniform [0, 1) values across supported NumPy RNG APIs."""

    if isinstance(rng, (np.random.Generator, np.random.RandomState)):
        if hasattr(rng, "random"):
            return rng.random(size=shape)
        return rng.random_sample(size=shape)
    if hasattr(rng, "rand"):
        return rng.rand(*shape)
    return np.random.random(size=shape)
