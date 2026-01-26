import importlib

import numpy as np


def test_save_model_writes_audio_feature_size(monkeypatch, tmp_path):
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    monkeypatch.setattr(module, "WINDOW_FEATURE_SIZE", 4)
    monkeypatch.setattr(module, "INPUT_FEATURE_SIZE", 2)
    monkeypatch.setattr(module, "WINDOW_SIZE", 2)

    input_dim = module.WINDOW_FEATURE_SIZE + 2
    layer1 = 3
    layer2 = 2
    output = 1

    w1 = np.zeros((input_dim, layer1), dtype=np.float32)
    b1 = np.zeros((layer1,), dtype=np.float32)
    w2 = np.zeros((layer1, layer2), dtype=np.float32)
    b2 = np.zeros((layer2,), dtype=np.float32)
    w3 = np.zeros((layer2, output), dtype=np.float32)
    b3 = np.zeros((output,), dtype=np.float32)

    dest = tmp_path / "model.npz"
    module.save_model(dest, (w1, b1, w2, b2, w3, b3), labels=["audio"])

    data = np.load(dest)
    assert int(data["input_dim"].item()) == input_dim
    assert int(data["audio_feature_size"].item()) == 2
    assert int(data["window_size"].item()) == 2
    assert int(data["feature_size"].item()) == 2

