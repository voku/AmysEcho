#!/usr/bin/env python3
"""
Amy's Echo Gesture Model Training Pipeline

WHAT THIS DOES:
- Extracts hand landmarks from gesture videos
- Augments data with noise variations
- Splits data into training and testing sets
- Trains an MLP neural network on the training data
- Evaluates the model on the testing data
- Deploys the trained model to the React Native app
- Rebuilds the WebView bundle for immediate use

WHEN TO USE:
- After adding new gesture videos
- When accuracy is poor and needs more training data
- To experiment with different model architectures

QUICK START:
cd /path/to/AmysEcho
python scripts/train_model.py --videos-dir app/assets/videos/

ASSUMPTIONS:
- Videos are in app/assets/videos/ named like: rot.mp4, gelb.mp4, essen.mp4
- Multiple videos per gesture: rot.mp4, rot_1.mp4, rot_2.mp4 (all become "rot" samples)
- Python dependencies are installed (numpy, opencv-python, mediapipe)
- Node.js/npm are available for app rebuilding

OUTPUT:
- data/amy_model.npz: Trained model
- app/assets/dgs_model.npz: Deployed model
- app/assets/gestureDetector.js: Updated WebView bundle
- Console logs with training progress, evaluation metrics, and final accuracy

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
from typing import Dict, List, Any, Optional, Tuple
import numpy as np
from collections import Counter
import random

# --- Normalization (must match recognizer) ---
def _normalize(lm):
    """Normalize one or two hands to be wrist-centered and scale-invariant."""
    if not lm or len(lm) < 21:
        return None

    # Handle both structured ([x,y,z] points) and flat formats
    if isinstance(lm[0], list) and len(lm[0]) == 3:
        # Structured format: list of [x,y,z] points
        pts = np.array(lm[:42])  # Take first 42 points
    else:
        # Flat format: assume 126 values (42 points * 3 coords)
        flat_lm = lm[:126] if len(lm) >= 126 else lm + [0.0] * (126 - len(lm))
        pts = np.array(flat_lm).reshape(42, 3)  # Reshape to 42 points with 3 coords each

    two_hands = len(pts) >= 42
    if len(pts) < 42:
        pad = np.zeros((42 - len(pts), 3))
        pts = np.vstack([pts, pad])

    def _norm_hand(hand: np.ndarray) -> np.ndarray | None:
        wrist = hand[0]
        hand = hand - wrist
        max_dist = np.max(np.sum(np.abs(hand), axis=1))
        if max_dist == 0:
            # Allow zero-distance hands (single-hand gestures with zero padding)
            return hand  # Return the wrist-centered hand without scaling
        hand /= max_dist
        return hand

    left = _norm_hand(pts[:21])
    right = _norm_hand(pts[21:])
    if left is None:
        print(f"DEBUG: Left hand normalization failed", file=sys.stderr)
        return None
    if right is None:
        # Allow single-hand data - just use zeros for the missing hand
        right = np.zeros_like(pts[:21])

    return np.concatenate([left, right]).flatten()


class MLP:
    def __init__(self, input_size, hidden_size, output_size, hidden_size_2=0):
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.hidden_size_2 = hidden_size_2
        self.output_size = output_size

        # Initialize weights
        self.w1 = np.random.randn(self.input_size, self.hidden_size) * 0.01
        self.b1 = np.zeros(self.hidden_size)
        if self.hidden_size_2 > 0:
            self.w2 = np.random.randn(self.hidden_size, self.hidden_size_2) * 0.01
            self.b2 = np.zeros(self.hidden_size_2)
            self.w3 = np.random.randn(self.hidden_size_2, self.output_size) * 0.01
            self.b3 = np.zeros(self.output_size)
        else:
            self.w2 = np.random.randn(self.hidden_size, self.output_size) * 0.01
            self.b2 = np.zeros(self.output_size)

    def relu(self, x):
        return np.maximum(0, x)

    def relu_derivative(self, x):
        return np.where(x > 0, 1, 0)

    def softmax(self, x):
        e_x = np.exp(x - np.max(x, axis=1, keepdims=True))
        return e_x / np.sum(e_x, axis=1, keepdims=True)

    def forward(self, X):
        self.z1 = np.dot(X, self.w1) + self.b1
        self.a1 = self.relu(self.z1)
        if self.hidden_size_2 > 0:
            self.z2 = np.dot(self.a1, self.w2) + self.b2
            self.a2 = self.relu(self.z2)
            self.z3 = np.dot(self.a2, self.w3) + self.b3
            probs = self.softmax(self.z3)
        else:
            self.z2 = np.dot(self.a1, self.w2) + self.b2
            probs = self.softmax(self.z2)
        return probs

    def backward(self, X, y, probs, learning_rate):
        num_samples = X.shape[0]

        if self.hidden_size_2 > 0:
            dz3 = probs
            dz3[np.arange(num_samples), y] -= 1
            dz3 /= num_samples

            dw3 = np.dot(self.a2.T, dz3)
            db3 = np.sum(dz3, axis=0)

            da2 = np.dot(dz3, self.w3.T)
            dz2 = da2 * self.relu_derivative(self.z2)

            dw2 = np.dot(self.a1.T, dz2)
            db2 = np.sum(dz2, axis=0)

            da1 = np.dot(dz2, self.w2.T)
            dz1 = da1 * self.relu_derivative(self.z1)

            dw1 = np.dot(X.T, dz1)
            db1 = np.sum(dz1, axis=0)

            # Update Weights
            self.w1 -= learning_rate * dw1
            self.b1 -= learning_rate * db1
            self.w2 -= learning_rate * dw2
            self.b2 -= learning_rate * db2
            self.w3 -= learning_rate * dw3
            self.b3 -= learning_rate * db3
        else:
            dz2 = probs
            dz2[np.arange(num_samples), y] -= 1
            dz2 /= num_samples

            dw2 = np.dot(self.a1.T, dz2)
            db2 = np.sum(dz2, axis=0)

            da1 = np.dot(dz2, self.w2.T)
            dz1 = da1 * self.relu_derivative(self.z1)

            dw1 = np.dot(X.T, dz1)
            db1 = np.sum(dz1, axis=0)

            # Update Weights
            self.w1 -= learning_rate * dw1
            self.b1 -= learning_rate * db1
            self.w2 -= learning_rate * dw2
            self.b2 -= learning_rate * db2

    def train(self, X, y, epochs, learning_rate):
        for epoch in range(epochs):
            probs = self.forward(X)

            # Loss (Cross-Entropy)
            log_probs = -np.log(probs[np.arange(X.shape[0]), y])
            loss = np.sum(log_probs) / X.shape[0]

            self.backward(X, y, probs, learning_rate)

            if (epoch + 1) % 100 == 0:
                print(
                    json.dumps(
                        {
                            "type": "progress",
                            "current": epoch + 1,
                            "total": epochs,
                            "loss": f"{loss:.4f}",
                        }
                    ),
                    flush=True,
                )



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

def augment_sample(sample: Dict[str, Any], num_augmentations: int = 3) -> List[Dict[str, Any]]:
    """Create augmented versions of a sample by adding small random noise"""
    augmented = [sample]  # Keep original
    landmarks = np.array(sample["landmarks"])

    for _ in range(num_augmentations):
        # Add small random noise to landmarks
        noise = np.random.normal(0, 0.01, landmarks.shape)  # Small noise
        augmented_landmarks = landmarks + noise

        # Ensure values stay in reasonable range
        augmented_landmarks = np.clip(augmented_landmarks, -2.0, 2.0)

        augmented.append({
            "label": sample["label"],
            "landmarks": augmented_landmarks.tolist()
        })

    return augmented

def prepare_data(
    landmarks_file: str, augmentation_factor: int, test_split: float
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, Dict[str, int]]:
    """Load, augment, and split data for training and testing."""
    with open(landmarks_file, "r") as f:
        data = json.load(f)

    samples = data.get("samples", [])
    if not samples:
        raise ValueError("No samples found in the landmarks file.")

    # Augment data
    if augmentation_factor > 1:
        augmented_samples = []
        for sample in samples:
            augmented_samples.extend(augment_sample(sample, augmentation_factor - 1))
        samples = augmented_samples

    # Preprocess and normalize
    X_raw = []
    y_raw = []
    label_to_idx = {}
    idx_counter = 0

    for sample in samples:
        label = sample.get("label")
        landmarks = sample.get("landmarks")

        if not label or not landmarks:
            continue

        frame_to_process = landmarks
        if isinstance(landmarks[0], list):
            if len(landmarks[0]) == 3:
                frame_to_process = [coord for point in landmarks for coord in point]
            elif isinstance(landmarks[0][0], list):
                frame_to_process = landmarks[len(landmarks) // 2]
                if isinstance(frame_to_process[0], list) and len(frame_to_process[0]) == 3:
                    frame_to_process = [coord for point in frame_to_process for coord in point]
            if isinstance(frame_to_process[0], list) and len(frame_to_process[0]) == 3:
                frame_to_process = [coord for point in frame_to_process for coord in point]

        normalized_lm = _normalize(frame_to_process)
        if normalized_lm is None:
            continue

        if label not in label_to_idx:
            label_to_idx[label] = idx_counter
            idx_counter += 1

        X_raw.append(normalized_lm)
        y_raw.append(label_to_idx[label])

    if not X_raw:
        raise ValueError("No valid samples could be processed.")

    # Split data
    X = np.array(X_raw)
    y = np.array(y_raw)
    
    indices = np.arange(X.shape[0])
    np.random.shuffle(indices)
    X = X[indices]
    y = y[indices]

    split_idx = int(X.shape[0] * (1 - test_split))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    return X_train, y_train, X_test, y_test, label_to_idx


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

def evaluate_model(mlp, X, y):
    """Evaluate the model and return accuracy."""
    probs = mlp.forward(X)
    preds = np.argmax(probs, axis=1)
    return float(np.mean(preds == y))

def main():
    parser = argparse.ArgumentParser(description="Train gesture recognition model for Amy's Echo")
    parser.add_argument('--videos-dir', required=True, help='Directory containing gesture videos')
    parser.add_argument('--output-model', default='data/amy_model.npz', help='Output model path')
    parser.add_argument('--epochs', type=int, default=500, help='Training epochs')
    parser.add_argument('--hidden-size', type=int, default=128, help='Hidden layer size')
    parser.add_argument('--hidden-size-2', type=int, default=0, help='Second hidden layer size')
    parser.add_argument('--learning-rate', type=float, default=0.01, help='Learning rate')
    parser.add_argument('--max-frames', type=int, default=300, help='Max frames per video')
    parser.add_argument('--frame-skip', type=int, default=2, help='Frame skip factor')
    parser.add_argument('--augmentation-factor', type=int, default=4, help='Data augmentation factor')
    parser.add_argument('--test-split', type=float, default=0.2, help='Fraction of data to use for testing')
    parser.add_argument('--skip-deploy', action='store_true', help='Skip model deployment')

    args = parser.parse_args()

    print("=== Amy's Echo Gesture Model Training Pipeline ===")

    landmarks_file = "data/temp_landmarks.json"
    try:
        # Step 1: Extract landmarks
        print("📹 Step 1: Extracting landmarks from videos...")
        if not extract_landmarks_from_videos(args.videos_dir, landmarks_file, args.max_frames, args.frame_skip):
            sys.exit(1)

        # Step 2: Prepare data
        print("🔄 Step 2: Preparing and splitting data...")
        X_train, y_train, X_test, y_test, label_to_idx = prepare_data(
            landmarks_file, args.augmentation_factor, args.test_split
        )
        
        print(f"Data prepared:")
        print(f"  - Training samples: {X_train.shape[0]}")
        print(f"  - Testing samples: {X_test.shape[0]}")
        print(f"  - Number of classes: {len(label_to_idx)}")


        # Step 3: Train model
        print("🧠 Step 3: Training neural network...")
        mlp = MLP(X_train.shape[1], args.hidden_size, len(label_to_idx), args.hidden_size_2)
        mlp.train(X_train, y_train, args.epochs, args.learning_rate)

        # Step 4: Evaluate model
        print("📊 Step 4: Evaluating model...")
        train_acc = evaluate_model(mlp, X_train, y_train)
        test_acc = evaluate_model(mlp, X_test, y_test)
        
        print(f"Evaluation results:")
        print(f"  - Training Accuracy: {train_acc:.4f}")
        print(f"  - Testing Accuracy: {test_acc:.4f}")

        # Step 5: Save model
        print("💾 Step 5: Saving model...")
        labels = sorted(label_to_idx.keys())
        os.makedirs(os.path.dirname(args.output_model), exist_ok=True)
        with open(args.output_model, "wb") as f:
            if args.hidden_size_2 > 0:
                np.savez(f, w1=np.array(mlp.w1.T, order='C'), b1=mlp.b1, w2=np.array(mlp.w2.T, order='C'), b2=mlp.b2, w3=np.array(mlp.w3.T, order='C'), b3=mlp.b3, labels=np.array(labels))
            else:
                np.savez(f, w1=np.array(mlp.w1.T, order='C'), b1=mlp.b1, w2=np.array(mlp.w2.T, order='C'), b2=mlp.b2, labels=np.array(labels))
        print(f"Model saved to {args.output_model}")

        # Step 6: Deploy model
        if not args.skip_deploy:
            print("📦 Step 6: Deploying model to app...")
            app_assets = "app/assets"
            if deploy_model(args.output_model, app_assets):
                print("✅ Model deployed to app!")
            else:
                sys.exit(1)

    finally:
        # Clean up temporary files
        if os.path.exists(landmarks_file):
            os.remove(landmarks_file)

    print("\n🎉 Training pipeline completed successfully!")

if __name__ == "__main__":
    main()
