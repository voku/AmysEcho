#!/usr/bin/env python3
"""
Frame Normalization for AmysEcho Temporal Pipeline
"""

import numpy as np
from typing import Optional, List

# Import from config_constants.py
from config_constants import (
    HAND_PRIORITY_FACTOR,
    POSE_PRIORITY_FACTOR,
    FACE_PRIORITY_FACTOR,
)


def _normalize_frame(
    landmarks: Optional[List[List[float]]], 
    pose_landmarks: Optional[List[List[float]]], 
    face_landmarks: Optional[List[List[float]]]
) -> Optional[np.ndarray]:
    """
    Normalize a single frame into a 1629-dimensional feature vector.
    """
    
    # ========================================================================
    # PART 1: HAND LANDMARKS (MANDATORY) - 126 Features
    # ========================================================================
    
    if not landmarks or len(landmarks) < 21:
        return None  # Hands are required for sign language
    
    # Convert to numpy array
    pts = np.array(landmarks, dtype=np.float32)
    
    # Handle flat list vs list of lists
    if pts.ndim == 1:
        pts = pts.reshape(-1, 3)
    
    # Ensure exactly 42 points (21 left + 21 right)
    if pts.shape[0] < 42:
        pad = np.zeros((42 - pts.shape[0], 3), dtype=np.float32)
        pts = np.vstack([pts, pad])
    else:
        pts = pts[:42]
    
    def _normalize_hand(hand_points: np.ndarray) -> np.ndarray:
        """Normalize a single hand (21 points)."""
        wrist = hand_points[0]
        centered = hand_points - wrist
        
        # L1 norm: sum of absolute coordinates
        max_dist = np.max(np.sum(np.abs(centered), axis=1))
        
        if max_dist < 1e-8:
            return centered  # Avoid division by zero
        
        return centered / max_dist
    
    # Normalize each hand separately
    left_hand = _normalize_hand(pts[:21])
    right_hand = _normalize_hand(pts[21:42])
    
    # Flatten and apply priority weighting
    hand_features = np.concatenate([left_hand, right_hand]).flatten() * HAND_PRIORITY_FACTOR
    
    # ========================================================================
    # PART 2: POSE LANDMARKS (OPTIONAL) - 99 Features
    # ========================================================================
    
    if pose_landmarks and len(pose_landmarks) >= 33:
        pose_arr = np.array(pose_landmarks, dtype=np.float32)
        
        # Extract only x,y,z (drop visibility if present)
        if pose_arr.shape[1] == 4:
            pose_arr = pose_arr[:33, :3]
        else:
            pose_arr = pose_arr[:33]
        
        # Normalize to torso center
        torso_indices = [11, 12, 23, 24]  # Shoulders + hips
        torso_center = np.mean(pose_arr[torso_indices], axis=0)
        pose_centered = pose_arr - torso_center
        
        # Scale by shoulder width
        shoulder_dist = np.linalg.norm(pose_arr[11] - pose_arr[12])
        if shoulder_dist > 1e-6:
            pose_centered /= shoulder_dist
        
        pose_features = pose_centered.flatten() * POSE_PRIORITY_FACTOR
    else:
        # Fill with zeros if unavailable
        pose_features = np.zeros(99, dtype=np.float32)
    
    # ========================================================================
    # PART 3: FACE LANDMARKS (OPTIONAL) - 1404 Features
    # ========================================================================
    
    if face_landmarks and len(face_landmarks) >= 468:
        face_arr = np.array(face_landmarks, dtype=np.float32)
        
        if face_arr.ndim == 1:
            face_arr = face_arr.reshape(-1, 3)
        
        face_arr = face_arr[:468, :3]
        
        # Center on nose tip
        nose = face_arr[1]
        face_centered = face_arr - nose
        
        # Scale by eye distance
        eye_dist = np.linalg.norm(face_arr[33] - face_arr[263])
        if eye_dist > 1e-6:
            face_centered /= eye_dist
        
        face_features = face_centered.flatten() * FACE_PRIORITY_FACTOR
    else:
        face_features = np.zeros(1404, dtype=np.float32)
    
    # ========================================================================
    # CONCATENATE ALL MODALITIES
    # ========================================================================
    
    return np.concatenate([hand_features, pose_features, face_features])


def test_normalize_frame():
    """Test frame normalization."""
    
    print("Testing _normalize_frame()...")
    
    # Test 1: Valid multimodal input
    hands = [[0.5 + i*0.01, 0.5, 0.0] for i in range(42)]
    pose = [[0.5, 0.5 + i*0.01, 0.0, 1.0] for i in range(33)]
    face = [[0.5, 0.5, 0.0] for i in range(468)]
    
    result = _normalize_frame(hands, pose, face)
    assert result is not None
    assert result.shape == (1629,)
    assert not np.isnan(result).any()
    print("  ✓ Valid multimodal input")
    
    # Test 2: Hands only
    result = _normalize_frame(hands, None, None)
    assert result is not None
    assert result.shape == (1629,)
    assert np.allclose(result[126:126+99], 0.0)  # Pose zeros
    assert np.allclose(result[126+99:], 0.0)     # Face zeros
    print("  ✓ Hands-only input")
    
    # Test 3: Missing hands
    result = _normalize_frame(None, pose, face)
    assert result is None
    print("  ✓ Missing hands returns None")
    
    # Test 4: Priority weighting check
    result_weighted = _normalize_frame(hands, pose, face)
    hand_mag = np.linalg.norm(result_weighted[:126])
    face_mag = np.linalg.norm(result_weighted[126+99:])
    ratio = hand_mag / face_mag if face_mag > 0 else np.inf
    assert ratio > 1.0, f"Hand/Face ratio {ratio:.2f} should be >1"
    print(f"  ✓ Priority weighting (Hand/Face ratio: {ratio:.2f})")
    
    print("All tests passed! ✓\n")

if __name__ == "__main__":
    test_normalize_frame()
