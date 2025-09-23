#!/usr/bin/env python3
"""
Amy's Echo Gesture Model Training Pipeline

WHAT THIS DOES:
- Extracts hand landmarks from gesture videos
- Augments data with noise variations (4x increase)
- Trains MLP neural network on the data
- Deploys trained model to the React Native app
- Rebuilds WebView bundle for immediate use

WHEN TO USE:
- After adding new gesture videos
- When accuracy is poor and needs more training data
- To experiment with different model architectures

QUICK START:
cd /path/to/AmysEcho
python scripts/train_gesture_model.py --videos-dir app/assets/videos/

ASSUMPTIONS:
- Videos are in app/assets/videos/ named like: rot.mp4, gelb.mp4, essen.mp4
- Multiple videos per gesture: rot.mp4, rot_1.mp4, rot_2.mp4 (all become "rot" samples)
- Python dependencies are installed (numpy, opencv, mediapipe)
- Node.js/npm are available for app rebuilding

OUTPUT:
- data/amy_model.npz: Trained model
- app/assets/dgs_model.npz: Deployed model
- app/assets/gestureDetector.js: Updated WebView bundle
- Console logs with training progress and final accuracy

TROUBLESHOOTING:
- If accuracy < 20%: Add more videos or increase --epochs to 1000+
- If memory errors: Reduce --hidden-size or increase --frame-skip
- If videos fail: Check video quality, ensure hands are visible
"""

import argparse
import json
import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, List, Any, Optional
import numpy as np

def run_command(cmd: str, cwd: Optional[str] = None) -> bool:
    """Run a shell command and return success status"""
    try:
        result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Command failed: {cmd}")
            print(f"Error: {result.stderr}")
            return False
        return True
    except Exception as e:
        print(f"Failed to run command: {cmd}")
        print(f"Error: {e}")
        return False

def extract_landmarks_from_videos(videos_dir: str, output_file: str, max_frames: int = 300, frame_skip: int = 2) -> bool:
    """Extract landmarks from videos using the processing script"""
    cmd = f"python3 scripts/process_dgs_videos.py --videos-dir {videos_dir} --output {output_file} --max-frames {max_frames} --frame-skip {frame_skip}"
    print(f"Extracting landmarks from videos...")
    return run_command(cmd)

def augment_training_data(input_file: str, output_file: str, augmentation_factor: int = 4) -> bool:
    """Augment training data with noise variations"""
    cmd = f"python3 scripts/prepare_training_data.py --video-data {input_file} --output {output_file}"
    print(f"Augmenting training data (factor: {augmentation_factor})...")
    return run_command(cmd)

def train_model(dataset_path: str, model_path: str, epochs: int = 500, hidden_size: int = 128, learning_rate: float = 0.01) -> bool:
    """Train the MLP model"""
    env = os.environ.copy()
    env.update({
        'MLP_DATASET_PATH': dataset_path,
        'MLP_MODEL_PATH': model_path,
        'MLP_EPOCHS': str(epochs),
        'MLP_HIDDEN_SIZE': str(hidden_size),
        'MLP_LEARNING_RATE': str(learning_rate)
    })

    cmd = "python3 src/amyserver_tools/train_mlp.py"
    print(f"Training model with {epochs} epochs...")
    result = subprocess.run(cmd, shell=True, cwd="server", env=env, capture_output=True, text=True)

    # Print training output
    if result.stdout:
        print("Training output:")
        print(result.stdout)

    if result.stderr:
        print("Training errors:")
        print(result.stderr)

    return result.returncode == 0

def deploy_model(model_path: str, app_assets_dir: str) -> bool:
    """Deploy the trained model to the app"""
    print("Deploying model to app...")

    # Copy model to app assets
    assets_model = os.path.join(app_assets_dir, "dgs_model.npz")
    if run_command(f"cp {model_path} {assets_model}"):
        print(f"Copied model to {assets_model}")
    else:
        return False

    # Update base64 encoding
    if run_command("base64 -w 0 dgs_model.npz > dgs_model_base64.txt", cwd=app_assets_dir):
        print("Updated base64 encoding")
    else:
        return False

    # Rebuild WebView bundle
    if run_command("npm run build:webview", cwd="app"):
        print("Rebuilt WebView bundle")
        return True
    else:
        return False

def validate_model(model_path: str) -> Dict[str, Any]:
    """Validate the trained model"""
    try:
        data = np.load(model_path)
        labels = data['labels']
        w1_shape = data['w1'].shape
        w2_shape = data['w2'].shape

        return {
            'valid': True,
            'num_classes': len(labels),
            'labels': labels.tolist(),
            'input_size': w1_shape[1],
            'hidden_size': w1_shape[0],
            'output_size': w2_shape[0]
        }
    except Exception as e:
        return {
            'valid': False,
            'error': str(e)
        }

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Train gesture recognition model for Amy's Echo")
    parser.add_argument('--videos-dir', required=True, help='Directory containing gesture videos')
    parser.add_argument('--output-model', default='data/amy_model.npz', help='Output model path')
    parser.add_argument('--epochs', type=int, default=500, help='Training epochs')
    parser.add_argument('--hidden-size', type=int, default=128, help='Hidden layer size')
    parser.add_argument('--learning-rate', type=float, default=0.01, help='Learning rate')
    parser.add_argument('--max-frames', type=int, default=300, help='Max frames per video')
    parser.add_argument('--frame-skip', type=int, default=2, help='Frame skip factor')
    parser.add_argument('--augmentation-factor', type=int, default=4, help='Data augmentation factor')
    parser.add_argument('--skip-deploy', action='store_true', help='Skip model deployment')
    parser.add_argument('--existing-data', help='Path to existing training data to merge')

    args = parser.parse_args()

    print("=== Amy's Echo Gesture Model Training Pipeline ===")
    print(f"Videos directory: {args.videos_dir}")
    print(f"Output model: {args.output_model}")
    print(f"Training epochs: {args.epochs}")
    print()

    # STEP 1: Extract hand landmarks from all videos
    # This creates samples like: {"label": "rot", "landmarks": [x,y,z, x,y,z, ...]}
    landmarks_file = "data/temp_landmarks.json"
    print("📹 Step 1: Extracting landmarks from videos...")
    if not extract_landmarks_from_videos(args.videos_dir, landmarks_file, args.max_frames, args.frame_skip):
        print("❌ Failed to extract landmarks from videos")
        return 1

    # STEP 2: Augment data with noise variations (4x increase by default)
    # Each original sample becomes 4 samples with slight random noise
    augmented_file = "data/temp_augmented.json"
    print("🔄 Step 2: Augmenting training data...")
    if not augment_training_data(landmarks_file, augmented_file):
        print("❌ Failed to augment training data")
        return 1

    # STEP 3: Train the neural network
    # Uses NumPy-based MLP with configurable hidden size and learning rate
    print("🧠 Step 3: Training neural network...")
    if not train_model(augmented_file, args.output_model, args.epochs, args.hidden_size, args.learning_rate):
        print("❌ Model training failed")
        return 1

    # STEP 4: Validate the trained model
    # Check that model loaded correctly and has expected structure
    print("✅ Step 4: Validating trained model...")
    validation = validate_model(args.output_model)
    if not validation['valid']:
        print(f"❌ Model validation failed: {validation['error']}")
        return 1

    print("✅ Model trained successfully!")
    print(f"   Classes: {validation['num_classes']}")
    print(f"   Labels: {validation['labels']}")
    print(f"   Architecture: {validation['input_size']} -> {validation['hidden_size']} -> {validation['output_size']}")

    # STEP 5: Deploy to app (unless --skip-deploy)
    # Copies model to app/assets/, updates base64, rebuilds WebView
    if not args.skip_deploy:
        print("📦 Step 5: Deploying model to app...")
        app_assets = "app/assets"
        if deploy_model(args.output_model, app_assets):
            print("✅ Model deployed to app!")
        else:
            print("❌ Failed to deploy model")
            return 1

    # Clean up temporary files
    try:
        os.remove(landmarks_file)
        os.remove(augmented_file)
    except:
        pass

    print("\n🎉 Training pipeline completed successfully!")
    print("Next steps:")
    print("1. Restart the Amy's Echo app")
    print("2. Test gesture recognition")
    print("3. Monitor performance and accuracy")

    return 0

if __name__ == "__main__":
    sys.exit(main())