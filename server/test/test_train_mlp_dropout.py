import importlib

import numpy as np

def test_train_mlp_dropout_uses_per_sample_masks(monkeypatch):
    monkeypatch.setenv("MLP_DROPOUT_RATE", "0.5")
    monkeypatch.setenv("MLP_EPOCHS", "1")
    monkeypatch.setenv("MLP_HIDDEN_SIZE", "6")

    module_name = "amyserver_tools.train_mlp"
    module = importlib.import_module(module_name)
    module = importlib.reload(module)

    rng = np.random.RandomState(123)
    sampled_values = []

    def fake_rand(*dims):
        values = rng.rand(*dims)
        sampled_values.append(values.copy())
        return values

    monkeypatch.setattr(module.np.random, "rand", fake_rand)

    num_samples = 4
    input_size = 10
    X = np.ones((num_samples, input_size), dtype=np.float32)
    y = np.arange(num_samples) % 3

    module.train_mlp(X, y, output_size=3)

    assert sampled_values, "dropout should sample a mask each epoch"
    mask_seed = sampled_values[0]
    assert mask_seed.shape == (num_samples, module.HIDDEN_SIZE)

    keep_prob = 1.0 - module.DROPOUT_RATE
    boolean_mask = mask_seed < keep_prob
    unique_rows = np.unique(boolean_mask, axis=0)
    assert unique_rows.shape[0] > 1, "each sample should receive an independent dropout pattern"
