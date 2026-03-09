#!/usr/bin/env python3
"""
Model Serialization for AmysEcho 3-Layer MLP
"""

import os
from pathlib import Path
from typing import Any

import numpy as np
from config_constants import (
    INPUT_FEATURE_SIZE,
    MLP_LAYER1_SIZE,
    MLP_LAYER2_SIZE,
    MODEL_ARCHITECTURE,
    MODEL_VERSION,
    WINDOW_FEATURE_SIZE,
    WINDOW_SIZE,
)

WeightTuple = tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]


def save_model(
    path: Path,
    weights: WeightTuple,
    labels: list[str],
    metadata: dict[str, Any] | None = None
) -> None:
    """
    Save 3-layer MLP model to .npz format.
    """

    w1, b1, w2, b2, w3, b3 = weights

    # Validate dimensions
    assert w1.shape == (WINDOW_FEATURE_SIZE, MLP_LAYER1_SIZE)
    assert w2.shape == (MLP_LAYER1_SIZE, MLP_LAYER2_SIZE)
    assert w3.shape[0] == MLP_LAYER2_SIZE
    assert w3.shape[1] == len(labels)

    # Create parent directory
    path.parent.mkdir(parents=True, exist_ok=True)

    # Atomic write via temp file
    tmp_path = path.with_suffix(path.suffix + ".tmp")

    # Prepare data
    save_dict = {
        # Weights (transposed for row-major storage in some inference engines)
        # Note: AmysEcho standard often expects transposed weights
        'w1': np.array(w1.T, order='C'),
        'b1': b1,
        'w2': np.array(w2.T, order='C'),
        'b2': b2,
        'w3': np.array(w3.T, order='C'),
        'b3': b3,

        # Labels
        'labels': np.array(labels),

        # Metadata
        'arch': MODEL_ARCHITECTURE,
        'version': MODEL_VERSION,
        'window_size': WINDOW_SIZE,
        'input_dim': WINDOW_FEATURE_SIZE,
        'feature_size': INPUT_FEATURE_SIZE,
        'layer_sizes': np.array([MLP_LAYER1_SIZE, MLP_LAYER2_SIZE], dtype=np.int32),
    }

    # Add custom metadata
    if metadata:
        for key, value in metadata.items():
            if key not in save_dict:
                try:
                    save_dict[key] = np.array(value)
                except (TypeError, ValueError):
                    pass

    # Save
    with tmp_path.open('wb') as f:
        np.savez_compressed(f, **save_dict)

    # Atomic rename
    os.replace(tmp_path, path)

    # Set permissions
    try:
        os.chmod(path, 0o640)
    except OSError:
        pass

    print(f"Model saved to {path}")


def load_model(path: Path) -> tuple[WeightTuple, list[str], dict[str, Any]]:
    """
    Load 3-layer MLP model from .npz format.
    """

    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}")

    # allow_pickle=True is needed for string arrays (labels) in modern numpy
    data = np.load(path, allow_pickle=True)

    # Extract weights (transpose back)
    try:
        w1 = data['w1'].copy().T
        b1 = data['b1'].copy()
        w2 = data['w2'].copy().T
        b2 = data['b2'].copy()
        w3 = data['w3'].copy().T
        b3 = data['b3'].copy()
    except KeyError as e:
        raise ValueError(f"Missing weight: {e}") from e

    weights = (w1, b1, w2, b2, w3, b3)

    # Extract labels
    labels = data['labels'].tolist()
    if not isinstance(labels, list):
        labels = list(labels)

    # Extract metadata
    metadata = {}
    for key in data.files:
        if key not in ['w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'labels']:
            value = data[key]
            if isinstance(value, np.ndarray):
                if value.ndim == 0:
                    metadata[key] = value.item()
                else:
                    metadata[key] = value.tolist()
            else:
                metadata[key] = value

    return weights, labels, metadata


def test_serialization():
    """Test model save/load."""

    print("Testing Model Serialization...")

    # Create dummy model
    w1 = np.random.randn(WINDOW_FEATURE_SIZE, MLP_LAYER1_SIZE).astype(np.float32)
    b1 = np.zeros(MLP_LAYER1_SIZE, dtype=np.float32)
    w2 = np.random.randn(MLP_LAYER1_SIZE, MLP_LAYER2_SIZE).astype(np.float32)
    b2 = np.zeros(MLP_LAYER2_SIZE, dtype=np.float32)
    w3 = np.random.randn(MLP_LAYER2_SIZE, 3).astype(np.float32)
    b3 = np.zeros(3, dtype=np.float32)

    weights = (w1, b1, w2, b2, w3, b3)
    labels = ["A", "B", "_NULL_"]

    # Save
    test_path = Path("/tmp/test_model.npz")
    save_model(test_path, weights, labels, metadata={'train_acc': 0.95})

    assert test_path.exists()
    print("  ✓ Model saved")

    # Load
    loaded_weights, loaded_labels, loaded_meta = load_model(test_path)

    assert loaded_labels == labels
    assert np.allclose(loaded_weights[0], w1)
    assert loaded_meta['train_acc'] == 0.95
    print("  ✓ Model loaded correctly")

    # Cleanup
    test_path.unlink()
    print("  ✓ Cleanup done")

    print("All tests passed! ✓\n")

if __name__ == "__main__":
    test_serialization()
