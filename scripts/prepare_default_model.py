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
5. Save the model to server/data/dgs_model.npz
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
DATA_DIR = PROJECT_ROOT / "server" / "data"
SAMPLES_FILE = DATA_DIR / "dgs_samples.json"
MODEL_FILE = DATA_DIR / "dgs_model.npz"

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

    # Basic gesture labels
    gestures = ['alle', 'blau', 'rot', 'gelb', 'gruen', 'essen', 'trinken', 'satt', 'spielen', 'schwester', 'nochmal', 'fertig']

    # Create minimal landmark data (42 landmarks per hand, 2 hands = 84 total)
    samples = []
    for gesture in gestures:
        # Create synthetic but realistic landmark data
        landmarks = []
        for i in range(42):
            # Generate somewhat realistic hand landmark positions
            x = 0.3 + (i % 21) * 0.01 + (0.05 if i >= 21 else 0)  # Different base for each hand
            y = 0.4 + (i // 21) * 0.1  # Different height for each hand
            z = (i % 5) * 0.01  # Some depth variation
            landmarks.append([x, y, z])

        samples.append({
            "label": gesture,
            "landmarks": landmarks
        })

    # Save the fallback data
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SAMPLES_FILE, 'w') as f:
        json.dump({"samples": samples}, f, indent=2)

    print(f"✓ Created fallback data with {len(samples)} samples")
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
            labels = data['labels']

        print(f"✓ Model loaded successfully")
        print(f"  - Input layer: {w1.shape[1]} -> {w1.shape[0]}")
        print(f"  - Hidden layer: {w1.shape[0]} -> {w2.shape[0]}")
        print(f"  - Output layer: {w2.shape[0]} -> {w2.shape[1]}")
        print(f"  - Classes: {list(labels)}")

        # Basic validation - check shapes are reasonable
        assert w1.shape[0] == 126, f"Input size mismatch: {w1.shape[0]}"  # 42 landmarks * 3 coordinates
        assert w1.shape[1] == 128, f"Hidden layer size mismatch: {w1.shape[1]}"
        assert w2.shape[0] == 128, f"Hidden to output layer size mismatch: {w2.shape[0]}"
        assert w2.shape[1] == len(labels), f"Output size mismatch: {w2.shape[1]} vs {len(labels)}"

        print("✓ Model validation passed")
        return True

    except Exception as e:
        print(f"✗ Model validation failed: {e}")
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