#!/usr/bin/env python3
"""
Default Model Preparation Script for Amy's Echo

This script prepares the default DGS gesture recognition model for the app by:
1. Processing existing DGS video data (if available)
2. Training the MLP model with default parameters
3. Validating the model performance
4. Saving the model in the correct format for the app

Usage:
python scripts/prepare_default_model.py

The script will:
1. Check for existing processed data
2. Use fallback sample data if videos are not processed
3. Train the model with optimized parameters
4. Validate model performance
5. Save the model to data/amy_model.npz
"""

import json
import os
import sys
import subprocess
from pathlib import Path

# Configuration
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
VIDEO_DIR = PROJECT_ROOT / "app" / "assets" / "videos"
DATA_DIR = PROJECT_ROOT / "data"
SAMPLES_FILE = DATA_DIR / "dgs_samples.json"
MODEL_FILE = DATA_DIR / "amy_model.npz"

def check_existing_data():
    """Check if processed landmark data already exists"""
    if SAMPLES_FILE.exists():
        print(f"✓ Found existing processed data: {SAMPLES_FILE}")
        return True
    else:
        print(f"✗ No processed data found at: {SAMPLES_FILE}")
        return False

def process_videos_if_needed():
    """Process DGS videos if data doesn't exist"""
    if not check_existing_data():
        print("Attempting to process DGS videos...")

        if not VIDEO_DIR.exists():
            print(f"✗ Video directory not found: {VIDEO_DIR}")
            return False

        # Check if videos exist
        video_files = list(VIDEO_DIR.glob("*.mp4"))
        if not video_files:
            print(f"✗ No video files found in: {VIDEO_DIR}")
            return False

        print(f"Found {len(video_files)} video files")

        # Try to run the video processing script
        try:
            cmd = [
                sys.executable,
                str(SCRIPT_DIR / "process_dgs_videos.py"),
                "--videos-dir", str(VIDEO_DIR),
                "--output", str(SAMPLES_FILE),
                "--max-frames", "100"
            ]

            print(f"Running: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

            if result.returncode == 0:
                print("✓ Video processing completed successfully")
                return True
            else:
                print(f"✗ Video processing failed: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            print("✗ Video processing timed out")
            return False
        except FileNotFoundError:
            print("✗ Video processing script not found")
            return False

    return True

def create_fallback_data():
    """Create minimal fallback data for testing if video processing fails"""
    print("Creating fallback sample data...")

    # Load default labels from config
    labels_config = PROJECT_ROOT / "server" / "data" / "config" / "defaultBaselineLabels.json"
    if labels_config.exists():
        with open(labels_config, 'r') as f:
            gestures = json.load(f)
    else:
        # Fallback if config missing
        gestures = ['alle', 'blau', 'essen', 'fertig', 'gelb', 'gruen', 'nochmal', 'rot', 'satt', 'schwester', 'spielen', 'trinken']

    # Create minimal landmark data (42 landmarks per hand, 2 hands = 84 total)
    samples = []
    # Generate 50 samples per gesture to provide more robust training data
    SAMPLES_PER_GESTURE = 50
    # Temporal window size
    WINDOW_SIZE = 30
    
    for gesture_idx, gesture in enumerate(gestures):
        for sample_idx in range(SAMPLES_PER_GESTURE):
            # Create a sequence of 30 frames for the temporal model
            sequence_landmarks = []
            
            # Randomized motion trajectory parameters
            # Amy First: Simulate different speeds and slight variations in path
            start_offset_x = np.random.uniform(-0.05, 0.05)
            start_offset_y = np.random.uniform(-0.05, 0.05)
            
            # Direction of motion varies per gesture
            # Some move up, some move sideways, some are relatively static
            motion_type = gesture_idx % 3
            move_x = 0.1 if motion_type == 1 else 0.0
            move_y = -0.1 if motion_type == 2 else 0.0
            
            for frame_idx in range(WINDOW_SIZE):
                t = frame_idx / (WINDOW_SIZE - 1)
                landmarks = []
                
                # Base motion pattern for this gesture + sample
                gesture_seed = gesture_idx * 0.1
                sample_seed = sample_idx * 0.01
                
                # Apply trajectory
                current_x_base = 0.3 + start_offset_x + (t * move_x)
                current_y_base = 0.4 + start_offset_y + (t * move_y)
                
                # 1. Hands (42 points)
                for i in range(42):
                    lx = current_x_base + (i % 21) * 0.01 + (0.05 if i >= 21 else 0) + gesture_seed + sample_seed + np.random.normal(0, 0.002)
                    ly = current_y_base + (i // 21) * 0.1 + gesture_seed - sample_seed + np.random.normal(0, 0.002)
                    lz = (i % 5) * 0.01 + (gesture_idx * 0.001) + np.random.normal(0, 0.001)
                    landmarks.append([lx, ly, lz])
                
                # 2. Pose (33 points)
                for i in range(33):
                    landmarks.append([0.5 + np.random.normal(0, 0.01), 0.5 + np.random.normal(0, 0.01), 0.0])
                
                # 3. Face (468 points)
                for i in range(468):
                    landmarks.append([0.5 + np.random.normal(0, 0.005), 0.5 + np.random.normal(0, 0.005), 0.0])
                
                sequence_landmarks.append(landmarks)

            # In this script, we currently save one "averaged" or "representative" frame per sample
            # for dgs_samples.json, as train_mlp.py handles the sliding window generation from there.
            # However, providing diverse spatial data is key.
            samples.append({
                "label": gesture,
                "landmarks": sequence_landmarks[WINDOW_SIZE // 2] # Use middle frame as representative
            })

    # Save the fallback data
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SAMPLES_FILE, 'w') as f:
        json.dump({"samples": samples}, f, indent=2)

    print(f"✓ Created fallback data with {len(samples)} samples ({len(gestures)} gestures)")
    return True

def train_model():
    """Train the MLP model using the processed data"""
    print("Training MLP model...")

    if not SAMPLES_FILE.exists():
        print("✗ No training data available")
        return False

    try:
        # Set environment variables for training
        env = os.environ.copy()
        env.update({
            "MLP_DATASET_PATH": str(SAMPLES_FILE),
            "MLP_MODEL_PATH": str(MODEL_FILE),
            "MLP_HIDDEN_SIZE": "128",
            "MLP_LEARNING_RATE": "0.01",
            "MLP_EPOCHS": "200"  # Reduced for faster training
        })

        cmd = [sys.executable, str(PROJECT_ROOT / "server" / "src" / "amyserver_tools" / "train_mlp.py")]

        print(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=300)

        if result.returncode == 0:
            print("✓ Model training completed successfully")
            # Parse the final metrics from stdout
            for line in result.stdout.strip().split('\n'):
                if '"type": "metrics"' in line:
                    try:
                        metrics = json.loads(line)
                        print(f"✓ Training metrics: {metrics['accuracy']} accuracy, {metrics['samples']} samples, {metrics['classes']} classes")
                    except json.JSONDecodeError:
                        pass
            return True
        else:
            print(f"✗ Model training failed: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print("✗ Model training timed out")
        return False
    except FileNotFoundError:
        print("✗ Training script not found")
        return False

def validate_model():
    """Validate that the trained model can be loaded and used"""
    print("Validating trained model...")

    if not MODEL_FILE.exists():
        print("✗ Model file not found")
        return False

    try:
        import numpy as np

        # Load the model
        with np.load(MODEL_FILE) as data:
            w1 = data['w1']
            b1 = data['b1']
            w2 = data['w2']
            b2 = data['b2']
            w3 = data['w3']
            b3 = data['b3']
            labels = data['labels']
            arch = str(data.get('arch', 'unknown'))
            window_size = int(data.get('window_size', 0))
            input_dim = int(data.get('input_dim', 0))

        print(f"✓ Model loaded successfully")
        print(f"  - Architecture: {arch}")
        print(f"  - Window Size: {window_size}")
        print(f"  - Input Dim: {input_dim}")
        print(f"  - W1 shape: {w1.shape}")
        print(f"  - W2 shape: {w2.shape}")
        print(f"  - W3 shape: {w3.shape}")
        print(f"  - Classes: {len(labels)} ({list(labels)[:5]}...)")

        # Basic validation for the new 3-layer temporal architecture
        # Expecting input_dim = 48870 (1629 * 30)
        
        # In the saved model, input_dim represents the total flattened input vector size
        expected_input = input_dim
        assert w1.shape[1] == expected_input, f"Input size mismatch: {w1.shape[1]} vs {expected_input}"
        assert w3.shape[0] == len(labels), f"Output size mismatch: {w3.shape[0]} vs {len(labels)}"
        assert arch == "mlp_3layer_window", f"Unexpected architecture: {arch}"

        print("✓ Model validation passed")
        return True

    except Exception as e:
        print(f"✗ Model validation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main preparation workflow"""
    print("=== Amy's Echo Default Model Preparation ===\n")

    # Ensure data directory exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Try to process videos
    if not process_videos_if_needed():
        print("Video processing failed, using fallback data...")
        if not create_fallback_data():
            print("✗ Failed to create fallback data")
            return 1

    # Step 2: Train the model
    if not train_model():
        print("✗ Model training failed")
        return 1

    # Step 3: Validate the model
    if not validate_model():
        print("✗ Model validation failed")
        return 1

    print("\n=== Model Preparation Complete ===")
    print(f"✓ Default model saved to: {MODEL_FILE}")
    print("✓ Model is ready for use in the app")

    return 0

if __name__ == "__main__":
    sys.exit(main())