import importlib
import json

import numpy as np
import pytest


class DeterministicRNG:
    def permutation(self, n):
        return np.arange(n)


def test_emit_event_routes_progress_to_stderr(capsys):
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    payload = {"type": "progress", "epoch": 1, "total": 5, "loss": "0.1234"}

    module._emit_event(payload)

    captured = capsys.readouterr()

    assert captured.out == ""

    err_lines = [line for line in captured.err.splitlines() if line.strip()]
    assert err_lines, "progress events should appear on stderr"

    for line in err_lines:
        assert json.loads(line) == payload


def test_train_mlp_dropout_uses_per_sample_masks(monkeypatch):
    module = importlib.import_module("amyserver_tools.train_mlp")

    rng = np.random.RandomState(123)
    sampled_values = []

    class StubRNG:
        def rand(self, *dims):
            values = rng.rand(*dims)
            sampled_values.append(values.copy())
            return values

        def randn(self, *dims):
            return np.ones(dims, dtype=np.float32)

    stub_rng = StubRNG()
    captured_a1 = []

    keep_prob = 0.5
    num_samples = 4
    input_size = 10
    hidden_size = 6
    output_size = 3

    from amyserver_tools.train_mlp import MLP_LAYER1_SIZE, MLP_LAYER2_SIZE
    original_dot = module.np.dot

    def capturing_dot(a, b, *args, **kwargs):
        result = original_dot(a, b, *args, **kwargs)
        # We want to capture activations after Layer 1 (a1) which is passed to Layer 2 (dot(a1, w2))
        # a1 shape: (num_samples, MLP_LAYER1_SIZE)
        # w2 shape: (MLP_LAYER1_SIZE, MLP_LAYER2_SIZE)
        if (
            isinstance(a, np.ndarray)
            and isinstance(b, np.ndarray)
            and a.shape == (num_samples, MLP_LAYER1_SIZE)
            and b.shape == (MLP_LAYER1_SIZE, MLP_LAYER2_SIZE)
        ):
            captured_a1.append(a.copy())
        return result

    monkeypatch.setattr(module.np, "dot", capturing_dot)

    X = np.ones((num_samples, input_size), dtype=np.float32)
    y = np.arange(num_samples) % output_size

    module.train_mlp(
        X,
        y,
        output_size=output_size,
        hidden_size=hidden_size,
        epochs=1,
        dropout_rate=1.0 - keep_prob,
        rng=stub_rng,
    )

    assert sampled_values, "dropout should sample masks each epoch"
    # We now have 2 masks per epoch (layer 1 and layer 2)
    assert len(sampled_values) >= 2
    mask1_seed = sampled_values[0]
    assert mask1_seed.shape == (num_samples, MLP_LAYER1_SIZE)

    boolean_mask = mask1_seed < keep_prob
    unique_rows = np.unique(boolean_mask, axis=0)
    assert unique_rows.shape[0] > 1, "each sample should receive an independent dropout pattern"

    assert captured_a1, "should capture activations after dropout is applied"

    # He initialization scale
    scale1 = np.sqrt(2.0 / input_size)
    # StubRNG.randn returns 1.0
    w1_stub = np.ones((input_size, MLP_LAYER1_SIZE), dtype=np.float32) * scale1
    pre_dropout = np.maximum(0, X.dot(w1_stub))
    scaled_mask = boolean_mask.astype(np.float32)
    if keep_prob > 0.0:
        scaled_mask /= keep_prob
    expected_activations = pre_dropout * scaled_mask

    np.testing.assert_allclose(captured_a1[0], expected_activations)


def test_train_mlp_respects_configuration_parameters(monkeypatch):
    module = importlib.import_module("amyserver_tools.train_mlp")

    class StubRNG:
        def rand(self, *dims):
            return np.zeros(dims, dtype=np.float32)

        def randn(self, *dims):
            return np.ones(dims, dtype=np.float32)

    stub_rng = StubRNG()

    printed = []

    def fake_print(*args, **kwargs):
        printed.append((args, kwargs))

    monkeypatch.setattr(module, "print", fake_print, raising=False)

    X = np.ones((2, 4), dtype=np.float32)
    y = np.array([0, 1], dtype=np.int64)

    hidden_size = 5
    epochs = 3
    learning_rate = 0.0

    w1, b1, w2, b2, w3, b3 = module.train_mlp(
        X,
        y,
        output_size=2,
        hidden_size=hidden_size,
        epochs=epochs,
        learning_rate=learning_rate,
        dropout_rate=0.0,
        rng=stub_rng,
    )

    from amyserver_tools.train_mlp import MLP_LAYER1_SIZE, MLP_LAYER2_SIZE
    assert w1.shape == (X.shape[1], MLP_LAYER1_SIZE)
    assert w2.shape == (MLP_LAYER1_SIZE, MLP_LAYER2_SIZE)
    assert w3.shape == (MLP_LAYER2_SIZE, 2)

    scale1 = np.sqrt(2.0 / X.shape[1])
    scale2 = np.sqrt(2.0 / MLP_LAYER1_SIZE)
    scale3 = np.sqrt(2.0 / MLP_LAYER2_SIZE)

    expected_w1 = np.ones((X.shape[1], MLP_LAYER1_SIZE), dtype=np.float32) * scale1
    expected_w2 = np.ones((MLP_LAYER1_SIZE, MLP_LAYER2_SIZE), dtype=np.float32) * scale2
    expected_w3 = np.ones((MLP_LAYER2_SIZE, 2), dtype=np.float32) * scale3

    np.testing.assert_allclose(w1, expected_w1)
    np.testing.assert_allclose(b1, np.zeros(MLP_LAYER1_SIZE))
    np.testing.assert_allclose(w2, expected_w2)
    np.testing.assert_allclose(b2, np.zeros(MLP_LAYER2_SIZE))
    np.testing.assert_allclose(w3, expected_w3)
    np.testing.assert_allclose(b3, np.zeros(2))

    assert printed == []


def test_plan_train_validation_split_keeps_single_training_sample():
    module = importlib.import_module("amyserver_tools.train_mlp")

    X = np.array([[0.5, -0.2, 0.1]], dtype=np.float32)
    y = np.array([0], dtype=np.int64)

    train_idx, val_idx = module.plan_train_validation_split(
        X,
        validation_fraction=0.9,
        rng=DeterministicRNG(),
    )

    assert train_idx.shape == (1,)
    assert train_idx.tolist() == [0]
    assert val_idx.size == 0

    weights = module.train_mlp(
        X[train_idx],
        y[train_idx],
        output_size=1,
        hidden_size=2,
        epochs=1,
        learning_rate=0.0,
        dropout_rate=0.0,
    )

    w1, b1, w2, b2, w3, b3 = weights

    from amyserver_tools.train_mlp import MLP_LAYER1_SIZE, MLP_LAYER2_SIZE
    assert w1.shape == (X.shape[1], MLP_LAYER1_SIZE)
    assert b1.shape == (MLP_LAYER1_SIZE,)
    assert w2.shape == (MLP_LAYER1_SIZE, MLP_LAYER2_SIZE)
    assert b2.shape == (MLP_LAYER2_SIZE,)
    assert w3.shape == (MLP_LAYER2_SIZE, 1)
    assert b3.shape == (1,)

    # Using standard initialization in test - weights won't be 1.0 but He-scaled.
    # We just want to check if the forward pass logic is consistent.
    a1 = module.relu(np.dot(X[train_idx], w1) + b1)
    a2 = module.relu(np.dot(a1, w2) + b2)
    logits = np.dot(a2, w3) + b3
    probs = module.softmax(logits)
    # With 1 class, softmax should always be 1.0
    np.testing.assert_allclose(probs, np.ones_like(probs))


@pytest.mark.parametrize(
    "num_samples, validation_fraction, expected_train, expected_val",
    [
        (0, 0.5, 0, 0),
        (1, 0.5, 1, 0),
        (10, 0.0, 10, 0),
        (10, 1.0, 1, 9),
        (10, 0.2, 8, 2),
        (10, 0.99, 1, 9),
        (4, 0.5, 2, 2),
    ],
)
def test_plan_train_validation_split_parameterized(
    num_samples, validation_fraction, expected_train, expected_val
):
    module = importlib.import_module("amyserver_tools.train_mlp")

    X = np.zeros((num_samples, 1), dtype=np.float32)

    train_idx, val_idx = module.plan_train_validation_split(
        X,
        validation_fraction=validation_fraction,
        rng=DeterministicRNG(),
    )

    assert len(train_idx) == expected_train
    assert len(val_idx) == expected_val

    if num_samples:
        assert len(np.intersect1d(train_idx, val_idx)) == 0
        assert len(train_idx) + len(val_idx) == num_samples
