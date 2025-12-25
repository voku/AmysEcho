import numpy as np
import pytest
from train_mlp import _normalize_frame, create_sliding_windows, Sample

def test_normalize_frame():
    """Test single frame normalization."""
    # Mock hand landmarks (21 left + 21 right)
    hands = [[0.5, 0.5, 0.0]] * 42
    pose = [[0.5, 0.5, 0.0, 1.0]] * 33
    face = [[0.5, 0.5, 0.0]] * 468
    
    result = _normalize_frame(hands, pose, face)
    assert result is not None
    assert result.shape == (1629,)
    assert not np.isnan(result).any()
    print("✓ Frame normalization test passed")

def test_sliding_windows():
    """Test window generation."""
    # Create 50 mock frame vectors
    frames = [np.random.randn(1629).astype(np.float32) for _ in range(50)]
    
    samples = create_sliding_windows(frames, "TEST", {})
    
    # Should generate 50 - 30 + 1 = 21 windows
    assert len(samples) == 21
    assert len(samples[0].landmarks) == 48870
    print("✓ Sliding window test passed")

def test_short_clip_padding():
    """Test padding for clips shorter than WINDOW_SIZE."""
    frames = [np.random.randn(1629).astype(np.float32) for _ in range(15)]
    
    samples = create_sliding_windows(frames, "TEST", {})
    
    # Should generate 1 window (padded to 30)
    assert len(samples) == 1
    assert len(samples[0].landmarks) == 48870
    print("✓ Padding test passed")

def test_null_class_generation():
    """Test that _NULL_ class is created."""
    # Mock a typical manifest entry processing
    frames = [np.random.randn(1629).astype(np.float32) for _ in range(60)]
    
    null_samples = create_sliding_windows(frames[:30], "_NULL_", {})
    sign_samples = create_sliding_windows(frames, "HELLO", {})
    
    assert len(null_samples) == 1  # First window
    assert null_samples[0].label == "_NULL_"
    assert len(sign_samples) == 31  # 60 - 30 + 1
    print("✓ NULL class test passed")

if __name__ == "__main__":
    test_normalize_frame()
    test_sliding_windows()
    test_short_clip_padding()

from train_mlp import train_mlp, _compute_accuracy

def test_train_mlp_smoke():
    """Smoke test for MLP training loop."""
    # Create dummy data: 10 samples, 48870 features
    X = np.random.randn(10, 48870).astype(np.float32)
    y = np.random.randint(0, 2, size=10)
    
    weights = train_mlp(X, y, output_size=2, epochs=2)
    
    assert len(weights) == 6  # w1, b1, w2, b2, w3, b3
    
    acc = _compute_accuracy(X, y, weights)
    assert 0.0 <= acc <= 1.0
    print("✓ MLP training smoke test passed")

if __name__ == "__main__":
    test_normalize_frame()
    test_sliding_windows()
    test_short_clip_padding()
    test_null_class_generation()
    test_train_mlp_smoke()
