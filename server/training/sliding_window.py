#!/usr/bin/env python3
"""
Sliding Window Generator for AmysEcho Temporal Pipeline
"""

import numpy as np
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from config_constants import WINDOW_SIZE, WINDOW_STRIDE, WINDOW_FEATURE_SIZE, INPUT_FEATURE_SIZE


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
    variation_diversity: Optional[float] = None
    canonical_templates_count: Optional[int] = None
    recording: Optional[Dict[str, Any]] = None
    timing_stats: Optional[Dict[str, float]] = None
    modality_coverage: Optional[Dict[str, float]] = None
    quality_weight: float = 1.0


def create_sliding_windows(
    frame_vectors: List[np.ndarray], 
    label: str, 
    context: Dict[str, Any],
    frame_weights: Optional[List[float]] = None
) -> List[Sample]:
    """
    Convert sequence of normalized frame vectors into sliding window samples.
    """
    
    if not frame_vectors:
        return []
    
    # Convert to array
    arr = np.array(frame_vectors, dtype=np.float32)  # Shape: (T, 1629)
    seq_len, feature_dim = arr.shape
    
    # Handle weights
    if frame_weights is None:
        weights_arr = np.ones(seq_len, dtype=np.float32)
    else:
        weights_arr = np.array(frame_weights, dtype=np.float32)
    
    # Validate feature dimension
    if feature_dim != INPUT_FEATURE_SIZE:
        raise ValueError(
            f"Expected frame vectors of size {INPUT_FEATURE_SIZE}, got {feature_dim}"
        )
    
    # ========================================================================
    # STEP 1: PADDING FOR SHORT CLIPS
    # ========================================================================
    
    if seq_len < WINDOW_SIZE:
        pad_qty = WINDOW_SIZE - seq_len
        last_frame = arr[-1:, :]  # Shape: (1, 1629)
        last_weight = weights_arr[-1]
        
        # Repeat last frame
        padding = np.repeat(last_frame, pad_qty, axis=0)
        arr = np.vstack([arr, padding])
        
        # Repeat last weight
        padding_weights = np.repeat(last_weight, pad_qty)
        weights_arr = np.concatenate([weights_arr, padding_weights])
        
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
        
        # Aggregate weights for this window (simple average)
        window_weight = float(np.mean(weights_arr[start_idx:end_idx]))
        
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
            variation_diversity=context.get('variation_diversity'),
            canonical_templates_count=context.get('canonical_templates_count'),
            recording=context.get('recording'),
            timing_stats=context.get('timing_stats'),
            modality_coverage=context.get('modality_coverage'),
            quality_weight=window_weight
        ))
    
    return samples