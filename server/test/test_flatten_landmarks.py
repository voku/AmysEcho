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
    # Verify each entry is a list of 3 floats
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
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
    assert isinstance(result["landmarks"], list)
    assert len(result["landmarks"]) == 42
    # Verify each entry is a list of 3 floats
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
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
    assert isinstance(result["landmarks"], list)
    assert len(result["landmarks"]) == 42
    # Verify each entry is a list of 3 floats
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
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
    assert isinstance(result["landmarks"], list)
    assert len(result["landmarks"]) == 42
    # Verify each entry is a list of 3 floats
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
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
    assert isinstance(result["landmarks"], list)
    assert len(result["landmarks"]) == 42
    # Verify each entry is a list of 3 floats
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
    # Average of 0.1i, 0.2i, 0.3i should be 0.2i
    assert result["landmarks"][1] == pytest.approx([0.2, 0.2, 0.2], abs=1e-6)
    assert result["landmarks"][10] == pytest.approx([2.0, 2.0, 2.0], abs=1e-6)


def test_flatten_landmarks_mean_multimodal_all_modalities(monkeypatch, tmp_path):
    """Test averaging with pose and face landmarks (all modalities present)."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    frames = [
        {
            "landmarks": [[0.0, 0.0, 0.0] for _ in range(42)],
            "poseLandmarks": [[0.0, 0.0, 0.0, 1.0] for _ in range(33)],
            "faceLandmarks": [[0.0, 0.0, 0.0] for _ in range(468)],
        },
        {
            "landmarks": [[1.0, 1.0, 1.0] for _ in range(42)],
            "poseLandmarks": [[1.0, 1.0, 1.0, 1.0] for _ in range(33)],
            "faceLandmarks": [[1.0, 1.0, 1.0] for _ in range(468)],
        },
    ]
    
    result = module.flatten_landmarks_mean(frames)
    
    assert result is not None
    assert "landmarks" in result
    assert "poseLandmarks" in result
    assert "faceLandmarks" in result
    assert isinstance(result["landmarks"], list)
    assert isinstance(result["poseLandmarks"], list)
    assert isinstance(result["faceLandmarks"], list)
    assert len(result["landmarks"]) == 42
    assert len(result["poseLandmarks"]) == 33
    assert len(result["faceLandmarks"]) == 468
    # Verify structure of each modality
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
    for point in result["poseLandmarks"]:
        assert isinstance(point, list)
        assert len(point) == 4  # x, y, z, visibility
    for point in result["faceLandmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
    # Verify averages (0.0 and 1.0 average to 0.5)
    assert result["landmarks"][0] == pytest.approx([0.5, 0.5, 0.5])
    assert result["poseLandmarks"][0] == pytest.approx([0.5, 0.5, 0.5, 1.0])
    assert result["faceLandmarks"][0] == pytest.approx([0.5, 0.5, 0.5])


def test_flatten_landmarks_mean_multimodal_pose_only(monkeypatch, tmp_path):
    """Test averaging with pose landmarks only (no face)."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    frames = [
        {
            "landmarks": [[0.0, 0.0, 0.0] for _ in range(42)],
            "poseLandmarks": [[0.0, 0.0, 0.0, 1.0] for _ in range(33)],
        },
        {
            "landmarks": [[2.0, 2.0, 2.0] for _ in range(42)],
            "poseLandmarks": [[2.0, 2.0, 2.0, 1.0] for _ in range(33)],
        },
    ]
    
    result = module.flatten_landmarks_mean(frames)
    
    assert result is not None
    assert "landmarks" in result
    assert "poseLandmarks" in result
    assert "faceLandmarks" not in result  # Should not be present
    assert isinstance(result["landmarks"], list)
    assert isinstance(result["poseLandmarks"], list)
    assert len(result["landmarks"]) == 42
    assert len(result["poseLandmarks"]) == 33
    # Verify structure
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
    for point in result["poseLandmarks"]:
        assert isinstance(point, list)
        assert len(point) == 4
    # Verify averages
    assert result["landmarks"][0] == pytest.approx([1.0, 1.0, 1.0])
    assert result["poseLandmarks"][0] == pytest.approx([1.0, 1.0, 1.0, 1.0])


def test_flatten_landmarks_mean_multimodal_face_only(monkeypatch, tmp_path):
    """Test averaging with face landmarks only (no pose)."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    frames = [
        {
            "landmarks": [[0.0, 0.0, 0.0] for _ in range(42)],
            "faceLandmarks": [[0.0, 0.0, 0.0] for _ in range(468)],
        },
        {
            "landmarks": [[3.0, 3.0, 3.0] for _ in range(42)],
            "faceLandmarks": [[3.0, 3.0, 3.0] for _ in range(468)],
        },
    ]
    
    result = module.flatten_landmarks_mean(frames)
    
    assert result is not None
    assert "landmarks" in result
    assert "poseLandmarks" not in result  # Should not be present
    assert "faceLandmarks" in result
    assert isinstance(result["landmarks"], list)
    assert isinstance(result["faceLandmarks"], list)
    assert len(result["landmarks"]) == 42
    assert len(result["faceLandmarks"]) == 468
    # Verify structure
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
    for point in result["faceLandmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
    # Verify averages
    assert result["landmarks"][0] == pytest.approx([1.5, 1.5, 1.5])
    assert result["faceLandmarks"][0] == pytest.approx([1.5, 1.5, 1.5])


def test_flatten_landmarks_mean_multimodal_missing_modalities(monkeypatch, tmp_path):
    """Test frames with missing/empty modalities in some frames."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    # First frame has all modalities, second frame only has hands
    frames = [
        {
            "landmarks": [[0.0, 0.0, 0.0] for _ in range(42)],
            "poseLandmarks": [[0.0, 0.0, 0.0, 1.0] for _ in range(33)],
            "faceLandmarks": [[0.0, 0.0, 0.0] for _ in range(468)],
        },
        {
            "landmarks": [[2.0, 2.0, 2.0] for _ in range(42)],
            # Missing pose and face
        },
    ]
    
    result = module.flatten_landmarks_mean(frames)
    
    assert result is not None
    assert "landmarks" in result
    # Pose/face should not be included because not all frames have them
    assert "poseLandmarks" not in result
    assert "faceLandmarks" not in result
    assert isinstance(result["landmarks"], list)
    assert len(result["landmarks"]) == 42
    # Verify structure
    for point in result["landmarks"]:
        assert isinstance(point, list)
        assert len(point) == 3
    # Hand landmarks should still be averaged
    assert result["landmarks"][0] == pytest.approx([1.0, 1.0, 1.0])


def test_flatten_landmarks_mean_multimodal_weighted(monkeypatch, tmp_path):
    """Test weighted averaging across multimodal data."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    # Frame with weight 1.0 has value 0.0
    # Frame with weight 9.0 has value 1.0
    # Expected weighted average: (0.0 * 1.0 + 1.0 * 9.0) / 10.0 = 0.9
    frames = [
        {
            "landmarks": [[0.0, 0.0, 0.0] for _ in range(42)],
            "poseLandmarks": [[0.0, 0.0, 0.0, 1.0] for _ in range(33)],
            "faceLandmarks": [[0.0, 0.0, 0.0] for _ in range(468)],
            "weight": 1.0,
        },
        {
            "landmarks": [[1.0, 1.0, 1.0] for _ in range(42)],
            "poseLandmarks": [[1.0, 1.0, 1.0, 1.0] for _ in range(33)],
            "faceLandmarks": [[1.0, 1.0, 1.0] for _ in range(468)],
            "weight": 9.0,
        },
    ]
    
    result = module.flatten_landmarks_mean(frames)
    
    assert result is not None
    assert "landmarks" in result
    assert "poseLandmarks" in result
    assert "faceLandmarks" in result
    assert isinstance(result["landmarks"], list)
    assert isinstance(result["poseLandmarks"], list)
    assert isinstance(result["faceLandmarks"], list)
    assert len(result["landmarks"]) == 42
    assert len(result["poseLandmarks"]) == 33
    assert len(result["faceLandmarks"]) == 468
    # Verify weighted averages (0.9 for all modalities)
    expected = 0.9
    assert result["landmarks"][0] == pytest.approx([expected, expected, expected], abs=1e-6)
    assert result["poseLandmarks"][0] == pytest.approx([expected, expected, expected, 1.0], abs=1e-6)
    assert result["faceLandmarks"][0] == pytest.approx([expected, expected, expected], abs=1e-6)


def test_flatten_landmarks_mean_multimodal_empty_modality_lists(monkeypatch, tmp_path):
    """Test frames with empty lists for optional modalities."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    frames = [
        {
            "landmarks": [[0.0, 0.0, 0.0] for _ in range(42)],
            "poseLandmarks": [],  # Empty list
            "faceLandmarks": [],  # Empty list
        },
        {
            "landmarks": [[1.0, 1.0, 1.0] for _ in range(42)],
            "poseLandmarks": [],  # Empty list
            "faceLandmarks": [],  # Empty list
        },
    ]
    
    result = module.flatten_landmarks_mean(frames)
    
    assert result is not None
    assert "landmarks" in result
    # Empty lists should be treated as missing
    assert "poseLandmarks" not in result
    assert "faceLandmarks" not in result
    assert isinstance(result["landmarks"], list)
    assert len(result["landmarks"]) == 42
    # Verify hand landmarks are still averaged
    assert result["landmarks"][0] == pytest.approx([0.5, 0.5, 0.5])
