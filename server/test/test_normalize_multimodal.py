"""Unit tests for multimodal normalization (_normalize_multimodal)."""

import importlib

import numpy as np
import pytest


def test_normalize_multimodal_hands_only(monkeypatch, tmp_path):
    """Test that hands-only multimodal normalization works correctly."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=None,
        face_landmarks=None,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    # Should be 126 (hands) + 99 (pose zeros) + 33 (face zeros) = 258
    assert result.shape == (258,)
    # First 126 should be normalized hands, rest zeros
    assert not np.allclose(result[:126], 0.0)  # Hands should have values
    assert np.allclose(result[126:225], 0.0)  # Pose should be zeros
    assert np.allclose(result[225:], 0.0)  # Face should be zeros


def test_normalize_multimodal_all_modalities(monkeypatch, tmp_path):
    """Test normalization with all modalities present."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    pose_landmarks = [[0.5 + 0.01 * i, 0.5 + 0.01 * i, 0.5, 1.0] for i in range(33)]
    face_landmarks = [[0.3 + 0.001 * i, 0.3, 0.3] for i in range(468)]
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=pose_landmarks,
        face_landmarks=face_landmarks,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    assert result.shape == (258,)
    # All sections should have non-zero values
    assert not np.allclose(result[:126], 0.0)  # Hands
    assert not np.allclose(result[126:225], 0.0)  # Pose
    assert not np.allclose(result[225:], 0.0)  # Face


def test_normalize_multimodal_pose_only(monkeypatch, tmp_path):
    """Test normalization with hands and pose but no face."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    pose_landmarks = [[0.5 + 0.01 * i, 0.5 + 0.01 * i, 0.5, 1.0] for i in range(33)]
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=pose_landmarks,
        face_landmarks=None,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    assert result.shape == (258,)
    assert not np.allclose(result[:126], 0.0)  # Hands
    assert not np.allclose(result[126:225], 0.0)  # Pose
    assert np.allclose(result[225:], 0.0)  # Face should be zeros


def test_normalize_multimodal_face_only(monkeypatch, tmp_path):
    """Test normalization with hands and face but no pose."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    face_landmarks = [[0.3 + 0.001 * i, 0.3, 0.3] for i in range(468)]
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=None,
        face_landmarks=face_landmarks,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    assert result.shape == (258,)
    assert not np.allclose(result[:126], 0.0)  # Hands
    assert np.allclose(result[126:225], 0.0)  # Pose should be zeros
    assert not np.allclose(result[225:], 0.0)  # Face


def test_normalize_multimodal_all_zero_hand_landmarks(monkeypatch, tmp_path):
    """Test that all-zero hand landmarks are handled (returns all zeros)."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    # All zeros - normalize returns zeros but doesn't fail
    hand_landmarks = [[0.0, 0.0, 0.0] for _ in range(42)]
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=None,
        face_landmarks=None,
    )
    
    result = module._normalize_multimodal(sample)
    
    # All zeros input produces all zeros output
    assert result is not None
    assert result.shape == (258,)
    assert np.allclose(result, 0.0)


def test_normalize_multimodal_incomplete_pose(monkeypatch, tmp_path):
    """Test that incomplete pose landmarks are replaced with zeros."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    # Only 10 pose landmarks (should be 33)
    pose_landmarks = [[0.5, 0.5, 0.5, 1.0] for _ in range(10)]
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=pose_landmarks,
        face_landmarks=None,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    assert result.shape == (258,)
    assert not np.allclose(result[:126], 0.0)  # Hands
    assert np.allclose(result[126:225], 0.0)  # Incomplete pose -> zeros
    assert np.allclose(result[225:], 0.0)  # No face


def test_normalize_multimodal_incomplete_face(monkeypatch, tmp_path):
    """Test that incomplete face landmarks are replaced with zeros."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    # Only 100 face landmarks (should be 468)
    face_landmarks = [[0.3, 0.3, 0.3] for _ in range(100)]
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=None,
        face_landmarks=face_landmarks,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    assert result.shape == (258,)
    assert not np.allclose(result[:126], 0.0)  # Hands
    assert np.allclose(result[126:225], 0.0)  # No pose
    assert np.allclose(result[225:], 0.0)  # Incomplete face -> zeros


def test_normalize_multimodal_pose_normalized_to_torso(monkeypatch, tmp_path):
    """Test that pose landmarks are properly centered on torso."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    # Create pose with known torso center
    pose_landmarks = [[0.0, 0.0, 0.0, 1.0] for _ in range(33)]
    # Set shoulders (11, 12) and hips (23, 24) to specific values
    pose_landmarks[11] = [0.0, 1.0, 0.0, 1.0]  # Left shoulder
    pose_landmarks[12] = [0.0, -1.0, 0.0, 1.0]  # Right shoulder
    pose_landmarks[23] = [0.0, 1.0, 0.0, 1.0]  # Left hip
    pose_landmarks[24] = [0.0, -1.0, 0.0, 1.0]  # Right hip
    # Torso center should be (0, 0, 0)
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=pose_landmarks,
        face_landmarks=None,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    # Verify pose section is normalized (all values should be scaled by shoulder width = 2.0)
    pose_section = result[126:225].reshape(33, 3)
    # Shoulders should be at y = ±0.5 after normalization (±1.0 / 2.0)
    assert np.allclose(pose_section[11, 1], 0.5, atol=0.1)
    assert np.allclose(pose_section[12, 1], -0.5, atol=0.1)


def test_normalize_multimodal_face_normalized_to_nose(monkeypatch, tmp_path):
    """Test that face landmarks are properly centered on nose."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    # Create face with nose at (0.5, 0.5, 0.5)
    face_landmarks = [[0.5, 0.5, 0.5] for _ in range(468)]
    face_landmarks[1] = [0.5, 0.5, 0.5]  # Nose tip (index 1)
    face_landmarks[33] = [0.0, 0.5, 0.5]  # Left eye
    face_landmarks[263] = [1.0, 0.5, 0.5]  # Right eye (eye distance = 1.0)
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=None,
        face_landmarks=face_landmarks,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    # Face section should be normalized (scaled by eye distance = 1.0)
    face_section = result[225:].reshape(11, 3)
    # Nose tip is at index 4 in key_indices list (5th element)
    # After normalization to nose, it should be (0, 0, 0)
    assert np.allclose(face_section[4], [0.0, 0.0, 0.0], atol=0.01)


def test_normalize_multimodal_zero_shoulder_width(monkeypatch, tmp_path):
    """Test handling of zero shoulder width in pose normalization."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    # Create pose with shoulders at same position (zero width)
    pose_landmarks = [[0.0, 0.0, 0.0, 1.0] for _ in range(33)]
    pose_landmarks[11] = [0.0, 0.0, 0.0, 1.0]  # Left shoulder
    pose_landmarks[12] = [0.0, 0.0, 0.0, 1.0]  # Right shoulder (same position)
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=pose_landmarks,
        face_landmarks=None,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    # Should not crash, pose section should exist
    pose_section = result[126:225]
    assert pose_section.shape == (99,)


def test_normalize_multimodal_zero_eye_distance(monkeypatch, tmp_path):
    """Test handling of zero eye distance in face normalization."""
    monkeypatch.setenv("MLP_DATA_DIR", str(tmp_path))
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    
    hand_landmarks = [[0.1 * i, 0.1 * i, 0.1 * i] for i in range(42)]
    # Create face with eyes at same position (zero distance)
    face_landmarks = [[0.5, 0.5, 0.5] for _ in range(468)]
    face_landmarks[33] = [0.5, 0.5, 0.5]  # Left eye
    face_landmarks[263] = [0.5, 0.5, 0.5]  # Right eye (same position)
    
    sample = module.Sample(
        label="TEST",
        profile_id=None,
        landmarks=hand_landmarks,
        pose_landmarks=None,
        face_landmarks=face_landmarks,
    )
    
    result = module._normalize_multimodal(sample)
    
    assert result is not None
    # Should not crash, face section should exist
    face_section = result[225:]
    assert face_section.shape == (33,)
