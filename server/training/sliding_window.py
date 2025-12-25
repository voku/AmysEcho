#!/usr/bin/env python3
"""
Sliding Window Generator for AmysEcho Temporal Pipeline
"""

import numpy as np
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from config_constants import WINDOW_SIZE, WINDOW_STRIDE, WINDOW_FEATURE_SIZE


@dataclass
class Sample:
    """
    Training sample produced from a temporal window of frames.
    """
    label: str
    profile_id: Optional[str]
    landmarks: List[float]  # Flattened temporal window
    pose_landmarks: Optional[List[List[float]]] = None  # Deprecated
    face_landmarks: Optional[List[List[float]]] = None  # Deprecated
    hand_focus: Optional[str] = None
    variation_cluster_id: Optional[str] = None
    recording: Optional[Dict[str, Any]] = None
    timing_stats: Optional[Dict[str, float]] = None
    modality_coverage: Optional[Dict[str, float]] = None


def create_sliding_windows(
    frame_vectors: List[np.ndarray], 
    label: str, 
    context: Dict[str, Any]
) -> List[Sample]:
    """
    Convert sequence of normalized frame vectors into sliding window samples.
    """
    
    if not frame_vectors:
        return []
    
    # Convert to array
    arr = np.array(frame_vectors, dtype=np.float32)  # Shape: (T, 1629)
    seq_len, feature_dim = arr.shape
    
    # Validate feature dimension
    if feature_dim != 1629:
        raise ValueError(
            f"Expected frame vectors of size 1629, got {feature_dim}"
        )
    
    # ========================================================================
    # STEP 1: PADDING FOR SHORT CLIPS
    # ========================================================================
    
    if seq_len < WINDOW_SIZE:
        pad_qty = WINDOW_SIZE - seq_len
        last_frame = arr[-1:, :]  # Shape: (1, 1629)
        
        # Repeat last frame
        padding = np.repeat(last_frame, pad_qty, axis=0)
        arr = np.vstack([arr, padding])
        seq_len = WINDOW_SIZE
    
    # ========================================================================
    # STEP 2: GENERATE SLIDING WINDOWS
    # ========================================================================
    
    samples = []
    num_windows = (seq_len - WINDOW_SIZE) // WINDOW_STRIDE + 1
    
    for i in range(num_windows):
        start_idx = i * WINDOW_STRIDE
        end_idx = start_idx + WINDOW_SIZE
        
        # Extract window: (30, 1629)
        window = arr[start_idx:end_idx, :]
        
        # Flatten: (48,870,)
        flat_vector = window.flatten()
        
        # Convert to Python list (for JSON serialization)
        flat_list = flat_vector.tolist()
        
        # ====================================================================
        # STEP 3: CREATE SAMPLE OBJECT
        # ====================================================================
        
        samples.append(Sample(
            label=label,
            profile_id=context.get('profile_id'),
            landmarks=flat_list,
            pose_landmarks=None,
            face_landmarks=None,
            hand_focus=context.get('hand_focus'),
            variation_cluster_id=context.get('variation_cluster_id'),
            recording=context.get('recording'),
            timing_stats=context.get('timing_stats'),
            modality_coverage=context.get('modality_coverage')
        ))
    
    return samples


def test_create_sliding_windows():
    """Test sliding window generation."""
    
    print("Testing create_sliding_windows()...")
    
    # Test 1: Short clip (padding)
    short_frames = [np.random.randn(1629).astype(np.float32) for _ in range(15)]
    samples = create_sliding_windows(short_frames, "SHORT", {})
    
    assert len(samples) == 1
    assert len(samples[0].landmarks) == WINDOW_FEATURE_SIZE
    print(f"  ✓ Short clip (15 frames -> 1 padded window)")
    
    # Test 2: Exact window size
    exact_frames = [np.random.randn(1629).astype(np.float32) for _ in range(30)]
    samples = create_sliding_windows(exact_frames, "EXACT", {})
    
    assert len(samples) == 1
    print(f"  ✓ Exact window (30 frames -> 1 window)")
    
    # Test 3: Long clip
    long_frames = [np.random.randn(1629).astype(np.float32) for _ in range(60)]
    samples = create_sliding_windows(long_frames, "LONG", {})
    
    expected = 60 - WINDOW_SIZE + 1  # 31
    assert len(samples) == expected
    print(f"  ✓ Long clip (60 frames -> {expected} windows)")
    
    # Test 4: Context preservation
    context = {'profile_id': 'user123', 'hand_focus': 'both'}
    samples = create_sliding_windows(long_frames, "TEST", context)
    
    assert samples[0].profile_id == 'user123'
    assert samples[0].hand_focus == 'both'
    print(f"  ✓ Context preservation")
    
    # Test 5: Overlapping verification
    test_frames = [np.ones(1629) * i for i in range(60)]
    samples = create_sliding_windows(test_frames, "OVERLAP", {})
    
    # Second window should start at frame 1
    window2 = np.array(samples[1].landmarks).reshape(WINDOW_SIZE, 1629)
    assert np.allclose(window2[0], 1.0)  # First frame of window 2 = frame 1
    print(f"  ✓ Overlapping windows (stride=1)")
    
    print("All tests passed! ✓\n")

if __name__ == "__main__":
    test_create_sliding_windows()
