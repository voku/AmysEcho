import importlib

import numpy as np


def test_train_mlp_dropout_uses_per_sample_masks(monkeypatch):
    module_name = "amyserver_tools.train_mlp"
    module = importlib.import_module(module_name)

    monkeypatch.setattr(module, "DROPOUT_RATE", 0.5)
    monkeypatch.setattr(module, "EPOCHS", 1)
    monkeypatch.setattr(module, "HIDDEN_SIZE", 6)

    rng = np.random.RandomState(123)
    sampled_values = []
    captured_a1 = []

    keep_prob = 1.0 - module.DROPOUT_RATE
    num_samples = 4
    input_size = 10
    output_size = 3

    def fake_rand(*dims):
        values = rng.rand(*dims)
        sampled_values.append(values.copy())
        return values

    def fake_randn(*dims):
        return np.ones(dims, dtype=np.float32)

    original_dot = module.np.dot

    def capturing_dot(a, b, *args, **kwargs):
        result = original_dot(a, b, *args, **kwargs)
        if (
            isinstance(a, np.ndarray)
            and isinstance(b, np.ndarray)
            and a.shape == (num_samples, module.HIDDEN_SIZE)
            and b.shape == (module.HIDDEN_SIZE, output_size)
        ):
            captured_a1.append(a.copy())
        return result

    monkeypatch.setattr(module.np.random, "rand", fake_rand)
    monkeypatch.setattr(module.np.random, "randn", fake_randn)
    monkeypatch.setattr(module.np, "dot", capturing_dot)

    X = np.ones((num_samples, input_size), dtype=np.float32)
    y = np.arange(num_samples) % output_size

    module.train_mlp(X, y, output_size=output_size)

    assert sampled_values, "dropout should sample a mask each epoch"
    mask_seed = sampled_values[0]
    assert mask_seed.shape == (num_samples, module.HIDDEN_SIZE)

    boolean_mask = mask_seed < keep_prob
    unique_rows = np.unique(boolean_mask, axis=0)
    assert unique_rows.shape[0] > 1, "each sample should receive an independent dropout pattern"

    assert captured_a1, "should capture activations after dropout is applied"

    w1_stub = np.ones((input_size, module.HIDDEN_SIZE), dtype=np.float32) * 0.01
    pre_dropout = np.maximum(0, X.dot(w1_stub))
    scaled_mask = boolean_mask.astype(np.float32) / keep_prob
    expected_activations = pre_dropout * scaled_mask

    np.testing.assert_allclose(captured_a1[0], expected_activations)

    import sys

    sys.modules.pop(module_name, None)
