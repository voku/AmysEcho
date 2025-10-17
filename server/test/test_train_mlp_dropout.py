import importlib.util
import sys
from pathlib import Path

import numpy as np


def _load_train_mlp_module(module_name: str):
    module_path = Path(__file__).resolve().parents[1] / "src" / "amyserver_tools" / "train_mlp.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None  # narrow type for mypy/static analyzers
    spec.loader.exec_module(module)  # type: ignore[misc]
    return module


def test_train_mlp_dropout_uses_per_sample_masks(monkeypatch):
    module_name = "train_mlp_dropout_test_module"
    monkeypatch.setenv("MLP_DROPOUT_RATE", "0.5")
    monkeypatch.setenv("MLP_EPOCHS", "1")
    monkeypatch.setenv("MLP_HIDDEN_SIZE", "6")

    module = _load_train_mlp_module(module_name)
    sys.modules[module_name] = module

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

    try:
        module.train_mlp(X, y, output_size=3)
    finally:
        sys.modules.pop(module_name, None)

    assert sampled_values, "dropout should sample a mask each epoch"
    mask_seed = sampled_values[0]
    assert mask_seed.shape == (num_samples, module.HIDDEN_SIZE)

    keep_prob = 1.0 - max(0.0, min(1.0, module.DROPOUT_RATE))
    boolean_mask = mask_seed < keep_prob
    unique_rows = np.unique(boolean_mask, axis=0)
    assert unique_rows.shape[0] > 1, "each sample should receive an independent dropout pattern"
