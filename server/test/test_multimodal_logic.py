
import sys
import os
import numpy as np
import pytest
from pathlib import Path

# Add scripts dir to path to import train_model
sys.path.append(os.path.join(os.getcwd(), 'scripts'))

from train_model import _normalize, MLP

def test_normalize_hands_only():
    """Test normalization with just hand data (42 points)"""
    # Create 42 random points
    hands = np.random.rand(42, 3).tolist()
    
    normalized = _normalize(hands)
    
    # Expected output: 42 * 3 = 126
    assert len(normalized) == 126
    assert isinstance(normalized, np.ndarray)

def test_normalize_multimodal_hands_pose():
    """Test normalization with Hands + Pose (42 + 33 points)"""
    # 75 points total
    data = np.random.rand(75, 3).tolist()
    
    normalized = _normalize(data)
    
    # Expected: 42 (hands) + 33 (pose) = 75 points -> 225 floats
    assert len(normalized) == 225

def test_normalize_multimodal_full():
    """Test normalization with Hands + Pose + Face (42 + 33 + 468)"""
    # 543 points total
    data = np.random.rand(543, 3).tolist()
    
    normalized = _normalize(data)
    
    # Expected: 543 * 3 = 1629 floats
    assert len(normalized) == 1629

def test_mlp_initialization_multimodal():
    """Test that MLP can initialize with multimodal input size"""
    input_size = 1629
    hidden_size = 128
    output_size = 10
    
    mlp = MLP(input_size, hidden_size, output_size)
    
    assert mlp.w1.shape == (input_size, hidden_size)
    
    # Test forward pass with dummy data
    dummy_input = np.random.randn(1, input_size)
    output = mlp.forward(dummy_input)
    
    assert output.shape == (1, output_size)

if __name__ == "__main__":
    # Manually run if pytest fails
    try:
        test_normalize_hands_only()
        print("✅ test_normalize_hands_only passed")
        test_normalize_multimodal_hands_pose()
        print("✅ test_normalize_multimodal_hands_pose passed")
        test_normalize_multimodal_full()
        print("✅ test_normalize_multimodal_full passed")
        test_mlp_initialization_multimodal()
        print("✅ test_mlp_initialization_multimodal passed")
    except Exception as e:
        print(f"❌ Tests failed: {e}")
        sys.exit(1)
