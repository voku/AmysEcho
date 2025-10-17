import importlib
import json

import numpy as np


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

    original_dot = module.np.dot

    def capturing_dot(a, b, *args, **kwargs):
        result = original_dot(a, b, *args, **kwargs)
        if (
            isinstance(a, np.ndarray)
            and isinstance(b, np.ndarray)
            and a.shape == (num_samples, hidden_size)
            and b.shape == (hidden_size, output_size)
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

    assert sampled_values, "dropout should sample a mask each epoch"
    mask_seed = sampled_values[0]
    assert mask_seed.shape == (num_samples, hidden_size)

    boolean_mask = mask_seed < keep_prob
    unique_rows = np.unique(boolean_mask, axis=0)
    assert unique_rows.shape[0] > 1, "each sample should receive an independent dropout pattern"

    assert captured_a1, "should capture activations after dropout is applied"

    w1_stub = np.ones((input_size, hidden_size), dtype=np.float32) * 0.01
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

    w1, b1, w2, b2 = module.train_mlp(
        X,
        y,
        output_size=2,
        hidden_size=hidden_size,
        epochs=epochs,
        learning_rate=learning_rate,
        dropout_rate=0.0,
        rng=stub_rng,
    )

    assert w1.shape == (X.shape[1], hidden_size)
    assert w2.shape == (hidden_size, 2)

    expected_w1 = np.ones((X.shape[1], hidden_size), dtype=np.float32) * 0.01
    expected_w2 = np.ones((hidden_size, 2), dtype=np.float32) * 0.01

    np.testing.assert_allclose(w1, expected_w1)
    np.testing.assert_allclose(b1, np.zeros(hidden_size))
    np.testing.assert_allclose(w2, expected_w2)
    np.testing.assert_allclose(b2, np.zeros(2))

    assert len(printed) == epochs
    totals = [json.loads(args[0]) for args, _ in printed]
    assert all(entry["total"] == epochs for entry in totals)
