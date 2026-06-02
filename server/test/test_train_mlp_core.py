"""Direct coverage for extracted MLP numeric helpers."""

from __future__ import annotations

import numpy as np

from amyserver_tools import mlp_core


def test_softmax_supports_vector_and_matrix_inputs():
    vector_probs = mlp_core.softmax(np.array([1.0, 2.0, 3.0], dtype=np.float32))
    matrix_probs = mlp_core.softmax(
        np.array([[1.0, 2.0, 3.0], [3.0, 2.0, 1.0]], dtype=np.float32)
    )

    assert vector_probs.shape == (3,)
    np.testing.assert_allclose(np.sum(vector_probs), 1.0)
    np.testing.assert_allclose(np.sum(matrix_probs, axis=1), np.ones(2))


def test_relu_derivative_preserves_float_dtype():
    values = np.array([-1.0, 0.0, 2.0], dtype=np.float32)

    derivative = mlp_core.relu_derivative(values)

    assert derivative.dtype == values.dtype
    np.testing.assert_array_equal(derivative, np.array([0.0, 0.0, 1.0], dtype=np.float32))


def test_cross_entropy_returns_zero_for_empty_labels():
    probs = np.zeros((0, 2), dtype=np.float32)
    y = np.zeros((0,), dtype=np.int64)

    assert mlp_core.cross_entropy_from_probs(probs, y) == 0.0


def test_resolve_loss_weights_rejects_non_finite_and_negative_values():
    for weights in [
        np.array([1.0, np.nan], dtype=np.float32),
        np.array([1.0, np.inf], dtype=np.float32),
        np.array([1.0, -0.1], dtype=np.float32),
    ]:
        resolved, weight_sum = mlp_core.resolve_loss_weights(weights, expected_length=2)
        assert resolved is None
        assert weight_sum == 2.0


def test_resolve_loss_weights_accepts_valid_non_negative_values():
    weights = np.array([0.0, 2.0], dtype=np.float32)

    resolved, weight_sum = mlp_core.resolve_loss_weights(weights, expected_length=2)

    np.testing.assert_array_equal(resolved, weights)
    assert weight_sum == 2.0
