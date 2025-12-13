"""Unit tests for flatten_landmarks_mean weighted averaging."""

import importlib

import numpy as np
import pytest


def test_flatten_landmarks_mean_simple_average(monkeypatch, tmp_path):
    """Test that frames without weights use simple averaging."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    # Two frames with different landmark values
    frames = [
        {"landmarks": [[0.0, 0.0, 0.0] for _ in range(42)]},
        {"landmarks": [[2.0, 2.0, 2.0] for _ in range(42)]},
    ]

    result = module.flatten_landmarks_mean(frames)

    assert result is not None
    assert "landmarks" in result
    assert isinstance(result["landmarks"], list)
    assert len(result["landmarks"]) == 42
    # Average of 0.0 and 2.0 should be 1.0
    assert result["landmarks"][0] == pytest.approx([1.0, 1.0, 1.0])
    assert result["landmarks"][41] == pytest.approx([1.0, 1.0, 1.0])


def test_flatten_landmarks_mean_weighted_average(monkeypatch, tmp_path):
    """Test that frames with weights use weighted averaging."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    # Frame with weight 1.0 has value 0.0
    # Frame with weight 10.0 has value 1.0
    # Expected weighted average: (0.0 * 1.0 + 1.0 * 10.0) / 11.0 = 0.909...
    frames = [
        {"landmarks": [[0.0, 0.0, 0.0] for _ in range(42)], "weight": 1.0},
        {"landmarks": [[1.0, 1.0, 1.0] for _ in range(42)], "weight": 10.0},
    ]

    result = module.flatten_landmarks_mean(frames)

    assert result is not None
    assert "landmarks" in result
    expected = 10.0 / 11.0
    assert result["landmarks"][0] == pytest.approx([expected, expected, expected], abs=1e-6)


def test_flatten_landmarks_mean_mixed_weights(monkeypatch, tmp_path):
    """Test frames with some having weights and some not (default to 1.0)."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    # Frame without weight (defaults to 1.0) has value 0.0
    # Frame with weight 5.0 has value 1.0
    # Expected: (0.0 * 1.0 + 1.0 * 5.0) / 6.0 = 0.8333...
    frames = [
        {"landmarks": [[0.0, 0.0, 0.0] for _ in range(42)]},  # no weight = 1.0
        {"landmarks": [[1.0, 1.0, 1.0] for _ in range(42)], "weight": 5.0},
    ]

    result = module.flatten_landmarks_mean(frames)

    assert result is not None
    assert "landmarks" in result
    expected = 5.0 / 6.0
    assert result["landmarks"][0] == pytest.approx([expected, expected, expected], abs=1e-6)


def test_flatten_landmarks_mean_single_frame_with_weight(monkeypatch, tmp_path):
    """Test single frame with weight returns that frame's landmarks."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    frames = [
        {"landmarks": [[0.5, 0.6, 0.7] for _ in range(42)], "weight": 10.0},
    ]

    result = module.flatten_landmarks_mean(frames)

    assert result is not None
    assert "landmarks" in result
    assert result["landmarks"][0] == pytest.approx([0.5, 0.6, 0.7])


def test_flatten_landmarks_mean_empty_frames(monkeypatch, tmp_path):
    """Test that empty frame list returns None."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    result = module.flatten_landmarks_mean([])
    assert result is None


def test_flatten_landmarks_mean_backward_compatibility(monkeypatch, tmp_path):
    """Test that existing code without weights still works (backward compatibility)."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    # Legacy frames without weight field
    frames = [
        {"landmarks": [[i * 0.1, i * 0.1, i * 0.1] for i in range(42)]},
        {"landmarks": [[i * 0.2, i * 0.2, i * 0.2] for i in range(42)]},
        {"landmarks": [[i * 0.3, i * 0.3, i * 0.3] for i in range(42)]},
    ]

    result = module.flatten_landmarks_mean(frames)

    assert result is not None
    assert "landmarks" in result
    # Average of 0.1i, 0.2i, 0.3i should be 0.2i
    assert result["landmarks"][1] == pytest.approx([0.2, 0.2, 0.2], abs=1e-6)
    assert result["landmarks"][10] == pytest.approx([2.0, 2.0, 2.0], abs=1e-6)
