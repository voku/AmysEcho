import json
import os
import pytest
import numpy as np

def test_dgs_video_samples_integrity():
    """
    Verify that the processed DGS video samples contain valid, non-zero landmarks.
    This ensures that the MediaPipe extraction worked correctly.
    """
    samples_path = "server/data/dgs_video_samples.json"
    
    if not os.path.exists(samples_path):
        pytest.skip(f"{samples_path} does not exist. Run process_dgs_videos.py first.")
        
    with open(samples_path, 'r') as f:
        data = json.load(f)
        
    assert "samples" in data, "JSON missing 'samples' key"
    samples = data["samples"]
    assert len(samples) > 0, "No samples found in file"
    
    zero_sample_count = 0
    total_samples = len(samples)
    
    for i, sample in enumerate(samples):
        assert "label" in sample, f"Sample {i} missing label"
        assert "landmarks" in sample, f"Sample {i} missing landmarks"
        
        landmarks = np.array(sample["landmarks"])
        
        # Check shape (42 landmarks, 3 coords)
        # Note: Some scripts might output flat lists, others structured.
        # process_dgs_videos.py outputs list of [x,y,z]
        if landmarks.ndim == 2:
            assert landmarks.shape == (42, 3), f"Sample {i} has wrong shape {landmarks.shape}"
            flat_landmarks = landmarks.flatten()
        else:
            # Assume flat
            flat_landmarks = landmarks
            
        # Check if all zeros
        if np.all(flat_landmarks == 0):
            zero_sample_count += 1
            
    # We expect some zero samples (e.g. if hands not visible for a moment), 
    # but not ALL or a large majority.
    # The previous issue was 100% failure.
    
    zero_ratio = zero_sample_count / total_samples
    print(f"Zero-landmark samples: {zero_sample_count}/{total_samples} ({zero_ratio:.2%})")
    
    # Assert that at least 50% of samples have data (conservative threshold)
    assert zero_ratio < 0.5, f"Too many samples have all-zero landmarks! Ratio: {zero_ratio:.2%}"

def test_individual_landmark_files_integrity():
    """
    Verify that the individual *_landmarks.json files in server/data/dgs_video_examples
    contain valid non-zero landmarks. These are likely used by the training manifest.
    """
    examples_dir = "server/data/dgs_video_examples"
    if not os.path.exists(examples_dir):
        pytest.skip(f"{examples_dir} does not exist.")
        
    files = [f for f in os.listdir(examples_dir) if f.endswith("_landmarks.json")]
    if not files:
        pytest.skip("No landmark files found in examples dir")
        
    for filename in files:
        filepath = os.path.join(examples_dir, filename)
        with open(filepath, 'r') as f:
            data = json.load(f)
            
        frames = data.get("frames", [])
        if not frames:
            continue
            
        # Check for non-zero data
        has_nonzero = False
        for frame in frames:
            landmarks = np.array(frame["landmarks"])
            if landmarks.size > 0 and not np.all(landmarks == 0):
                has_nonzero = True
                break
                
        assert has_nonzero, f"File {filename} contains ONLY zero-valued landmarks!"

def test_synthetic_gestures_integrity():
    """
    Check synthetic gestures if they exist
    """
    syn_path = "server/data/synthetic_gestures_comprehensive.json"
    if os.path.exists(syn_path):
        with open(syn_path, 'r') as f:
            data = json.load(f)
        
        if isinstance(data, list):
            samples = data
        else:
            samples = data.get("samples", [])
            
        if samples:
            # Check a few samples
            for i in range(min(10, len(samples))):
                frames = samples[i].get("frames", [])
                if frames:
                    lm = np.array(frames[0].get("landmarks", []))
                    if lm.size > 0:
                        assert not np.all(lm == 0), f"Synthetic sample {i} frame 0 is all zeros"
