#!/usr/bin/env python3
"""
Amy's Echo Gesture Model Training Pipeline (Advanced Validation Edition)

WHAT THIS DOES:
- Extracts hand/pose/face landmarks from gesture videos
- Augments data with noise variations
- Splits data into training and testing sets (Stratified)
- Trains an MLP neural network
- VALIDATES with advanced metrics (F1-score, Confusion Matrix)
- OPTIONALLY runs K-Fold Cross-Validation
- Deploys the trained model

QUICK START:
python scripts/train_model.py --k-fold 5

"""

import argparse
import json
import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import numpy as np
import random
from ml_shared_utils import filter_by_profile_logic

# Try importing sklearn for advanced validation
try:
    from sklearn.model_selection import train_test_split, StratifiedKFold
    from sklearn.metrics import classification_report, confusion_matrix, f1_score, accuracy_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("Warning: scikit-learn not found. Advanced validation disabled. Install with 'pip install scikit-learn'")

# Density-Balanced Priority factors (Hands > Pose > Face)
# This prevents the 1404 face features from drowning out the 126 hand features.
HAND_PRIORITY_FACTOR = 3.0
POSE_PRIORITY_FACTOR = 0.4
FACE_PRIORITY_FACTOR = 0.1

# --- Normalization (must match recognizer) ---
def _normalize(lm):
    """
    Normalize multimodal landmarks (Hands, Pose, Face) to be centered and scale-invariant.
    - Hands (0-41): Centered on their respective wrists, scaled by HAND_PRIORITY_FACTOR
    - Pose (42-74): Centered on Nose, scaled by shoulder width and POSE_PRIORITY_FACTOR
    - Face (75-542): Centered on Nose Tip, scaled by eye distance and FACE_PRIORITY_FACTOR
    
    Total: 543 points -> 1629 floats.
    """
    if not lm:
        return None

    # Landmark data is expected to be flattened by prepare_data
    pts = np.array(lm).reshape(-1, 3)

    num_pts = len(pts)
    
    def _norm_geometric(points: np.ndarray, ref_idx: int, scale_indices: Tuple[int, int]) -> np.ndarray:
        if len(points) <= ref_idx: return points
        ref = points[ref_idx]
        points = points - ref
        # Scaling
        if scale_indices[0] < len(points) and scale_indices[1] < len(points):
            scale_factor = np.linalg.norm(points[scale_indices[0]] - points[scale_indices[1]])
            if scale_factor > 1e-6:
                points /= scale_factor
        return points

    # 1. Hands (Indices 0-41)
    if num_pts >= 42:
        hand_left = pts[0:21]
        hand_right = pts[21:42]
        
        # Center each hand on its wrist (landmark 0)
        hand_left = hand_left - hand_left[0]
        max_l = np.max(np.abs(hand_left))
        if max_l > 0: hand_left /= max_l
        
        hand_right = hand_right - hand_right[0]
        max_r = np.max(np.abs(hand_right))
        if max_r > 0: hand_right /= max_r
        
        # Apply Hand Priority Factor
        hands_norm = np.concatenate([hand_left, hand_right]) * HAND_PRIORITY_FACTOR
    else:
        # Fallback/Padding
        hands_norm = np.zeros((42, 3))

    # 2. Pose (Indices 42-74)
    pose_norm = np.array([])
    if num_pts >= 42 + 33:
        pose = pts[42:42+33]
        pose_norm = _norm_geometric(pose, 0, (11, 12)) * POSE_PRIORITY_FACTOR
    elif num_pts > 42:
        pose_norm = np.zeros((33, 3))
    
    # 3. Face (Indices 75-542)
    face_norm = np.array([])
    if num_pts >= 42 + 33 + 468:
        face = pts[42+33:42+33+468]
        face_norm = _norm_geometric(face, 1, (33, 263)) * FACE_PRIORITY_FACTOR
    elif num_pts > 42 + 33:
        face_norm = np.zeros((468, 3))

    # Concatenate all available modalities to reach consistent size
    result = hands_norm.flatten()
    
    if pose_norm.size > 0 or num_pts > 42:
        if pose_norm.size == 0: pose_norm = np.zeros((33, 3))
        result = np.concatenate([result, pose_norm.flatten()])
        
    if face_norm.size > 0 or num_pts > 42 + 33:
        if face_norm.size == 0: face_norm = np.zeros((468, 3))
        result = np.concatenate([result, face_norm.flatten()])
        
    return result


class MLP:
    def __init__(self, input_size, hidden_size, output_size, hidden_size_2=0):
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.hidden_size_2 = hidden_size_2
        self.output_size = output_size
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

    def relu(self, x): return np.maximum(0, x)
    def relu_derivative(self, x): return np.where(x > 0, 1, 0)
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
            dz3 = probs.copy()
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
            self.w1 -= learning_rate * dw1
            self.b1 -= learning_rate * db1
            self.w2 -= learning_rate * dw2
            self.b2 -= learning_rate * db2
            self.w3 -= learning_rate * dw3
            self.b3 -= learning_rate * db3
        else:
            dz2 = probs.copy()
            dz2[np.arange(num_samples), y] -= 1
            dz2 /= num_samples
            dw2 = np.dot(self.a1.T, dz2)
            db2 = np.sum(dz2, axis=0)
            da1 = np.dot(dz2, self.w2.T)
            dz1 = da1 * self.relu_derivative(self.z1)
            dw1 = np.dot(X.T, dz1)
            db1 = np.sum(dz1, axis=0)
            self.w1 -= learning_rate * dw1
            self.b1 -= learning_rate * db1
            self.w2 -= learning_rate * dw2
            self.b2 -= learning_rate * db2

    def train(self, X, y, epochs, learning_rate, verbose=False):
        for epoch in range(epochs):
            probs = self.forward(X)
            log_probs = -np.log(probs[np.arange(X.shape[0]), y] + 1e-9)
            loss = np.sum(log_probs) / X.shape[0]
            self.backward(X, y, probs, learning_rate)
            if verbose and (epoch + 1) % 100 == 0:
                print(json.dumps({"type": "progress", "current": epoch + 1, "total": epochs, "loss": f"{loss:.4f}"}), flush=True)

def run_command(cmd: str, cwd: Optional[str] = None) -> bool:
    try:
        result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
        return result.returncode == 0
    except Exception as e:
        print(f"Error running command: {e}")
        return False

def augment_sample(sample: Dict[str, Any], num_augmentations: int = 3) -> List[Dict[str, Any]]:
    augmented = [sample]
    landmarks = np.array(sample["landmarks"])
    for _ in range(num_augmentations):
        noise = np.random.normal(0, 0.01, landmarks.shape)
        augmented_landmarks = np.clip(landmarks + noise, -2.0, 2.0)
        augmented.append({"label": sample["label"], "landmarks": augmented_landmarks.tolist()})
    return augmented

def prepare_data(manifest_file: str, augmentation_factor: int, test_split: float, profile_id_filter: Optional[str] = None) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, Dict[str, int], np.ndarray, np.ndarray]:
    with open(manifest_file, "r") as f:
        manifest = json.load(f)
    
    all_entries = manifest.get("entries", [])
    if profile_id_filter is None:
        selected_entries = [e for e in all_entries if not e.get("profileId")]
    else:
        selected_entries = filter_by_profile_logic(all_entries, profile_id_filter, lambda e: e.get("label"), lambda e: e.get("profileId"))

    samples = []
    data_dir = Path(manifest_file).resolve().parent.parent

    for entry in selected_entries:
        lm_file = next((f for f in entry["storage"]["files"] if f.endswith("landmarks.json")), None)
        if not lm_file: continue
        landmarks_path = data_dir / entry["storage"]["directory"] / lm_file
        if not landmarks_path.exists(): continue
            
        with open(landmarks_path, "r") as f:
            landmark_data = json.load(f)
        
        label = entry.get("label")
        for frame in landmark_data.get("frames", []):
            landmarks = frame["landmarks"]
            # Zero-check
            flat_check = [c for p in landmarks for c in p] if isinstance(landmarks[0], list) else landmarks
            if flat_check and all(v == 0 for v in flat_check):
                 print(f"Warning: Found all-zero landmarks for label '{label}' in {lm_file}", file=sys.stderr)
            samples.append({"label": label, "landmarks": landmarks})

    if not samples: raise ValueError("No valid samples found.")

    if augmentation_factor > 1:
        augmented_samples = []
        for sample in samples:
            augmented_samples.extend(augment_sample(sample, augmentation_factor - 1))
        samples = augmented_samples

    X_raw, y_raw = [], []
    label_to_idx = {}
    idx_counter = 0

    for sample in samples:
        label = sample.get("label")
        lm = sample.get("landmarks")
        
        # Flatten logic
        flat_lm = []
        if isinstance(lm[0], list):
             flat_lm = [c for p in lm for c in p]
        else:
             flat_lm = lm

        normalized_lm = _normalize(flat_lm)
        if normalized_lm is None: continue

        if label not in label_to_idx:
            label_to_idx[label] = idx_counter
            idx_counter += 1

        X_raw.append(normalized_lm)
        y_raw.append(label_to_idx[label])

    X = np.array(X_raw)
    y = np.array(y_raw)
    
    # Stratified Split
    if SKLEARN_AVAILABLE:
        try:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_split, stratify=y, random_state=42)
        except ValueError:
            # Fallback if some class has too few samples for stratification
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_split, random_state=42)
    else:
        indices = np.arange(X.shape[0])
        np.random.shuffle(indices)
        X, y = X[indices], y[indices]
        split_idx = int(X.shape[0] * (1 - test_split))
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

    return X_train, y_train, X_test, y_test, label_to_idx, X, y

def evaluate_detailed(mlp, X, y, label_to_idx, title="Evaluation"):
    probs = mlp.forward(X)
    preds = np.argmax(probs, axis=1)
    acc = float(np.mean(preds == y))
    
    print(f"\n--- {title} ---")
    print(f"Accuracy: {acc:.2%}")
    
    if SKLEARN_AVAILABLE:
        labels = sorted(label_to_idx.keys(), key=lambda k: label_to_idx[k])
        target_names = labels
        
        print("\nClassification Report:")
        print(classification_report(y, preds, target_names=target_names, zero_division=0))
        
        print("\nConfusion Matrix:")
        cm = confusion_matrix(y, preds)
        print(cm)
        
        # Multimodal Check
        input_dim = X.shape[1]
        if input_dim > 126: # 42 * 3
            print(f"\n[INFO] Input dimension {input_dim} suggests MULTIMODAL data usage (Hands + X).")
        else:
            print(f"\n[INFO] Input dimension {input_dim} suggests HANDS-ONLY data.")
            
    return acc

def run_cross_validation(X, y, label_to_idx, args, k=5):
    if not SKLEARN_AVAILABLE:
        print("Cross-validation requires scikit-learn.")
        return

    print(f"\n=== Running {k}-Fold Cross-Validation ===")
    skf = StratifiedKFold(n_splits=k, shuffle=True, random_state=42)
    scores = []
    
    for i, (train_index, test_index) in enumerate(skf.split(X, y)):
        X_train_fold, X_test_fold = X[train_index], X[test_index]
        y_train_fold, y_test_fold = y[train_index], y[test_index]
        
        mlp = MLP(X.shape[1], args.hidden_size, len(label_to_idx), args.hidden_size_2)
        mlp.train(X_train_fold, y_train_fold, args.epochs, args.learning_rate)
        
        acc = evaluate_model(mlp, X_test_fold, y_test_fold)
        scores.append(acc)
        print(f"Fold {i+1}/{k}: {acc:.2%}")
        
    print(f"\nAverage Accuracy: {np.mean(scores):.2%} (+/- {np.std(scores):.2%})")

def evaluate_model(mlp, X, y):
    probs = mlp.forward(X)
    preds = np.argmax(probs, axis=1)
    return float(np.mean(preds == y))

def deploy_model(model_path: str, _app_assets_dir: str) -> bool:
    print("Deploying model to server baseline...")
    baseline_dir = os.path.join("server", "data", "models", "global")
    os.makedirs(baseline_dir, exist_ok=True)
    baseline_model = os.path.join(baseline_dir, "amy_model.npz")
    if run_command(f"cp {model_path} {baseline_model}"):
        print(f"Copied model to {baseline_model}")
        if run_command("npm run build:webview", cwd="app"):
            print("Rebuilt WebView bundle")
            return True
    return False

def main():
    parser = argparse.ArgumentParser(description="Train and evaluate the gesture recognition model with multimodal support and advanced validation.")
    parser.add_argument('--manifest', default='server/data/datasets/training_manifest.json')
    parser.add_argument('--output-model', default='data/amy_model.npz')
    parser.add_argument('--epochs', type=int, default=500)
    parser.add_argument('--hidden-size', type=int, default=128)
    parser.add_argument('--hidden-size-2', type=int, default=0)
    parser.add_argument('--learning-rate', type=float, default=0.01)
    parser.add_argument('--augmentation-factor', type=int, default=4)
    parser.add_argument('--test-split', type=float, default=0.2)
    parser.add_argument('--k-fold', type=int, default=0, help='Run K-Fold Cross Validation (e.g. 5)')
    parser.add_argument('--skip-deploy', action='store_true')
    args = parser.parse_args()

    try:
        # 1. Train Global Model
        print("\n=== Training Global Model ===")
        X_train, y_train, X_test, y_test, label_to_idx, X_full, y_full = prepare_data(
            args.manifest, args.augmentation_factor, args.test_split, profile_id_filter=None
        )
        
        if args.k_fold > 1:
            run_cross_validation(X_full, y_full, label_to_idx, args, k=args.k_fold)
            
        mlp = MLP(X_train.shape[1], args.hidden_size, len(label_to_idx), args.hidden_size_2)
        mlp.train(X_train, y_train, args.epochs, args.learning_rate, verbose=True)
        evaluate_detailed(mlp, X_test, y_test, label_to_idx, title="Global Test Set Evaluation")
        
        # Save Global Model
        labels = sorted(label_to_idx.keys())
        os.makedirs(os.path.dirname(args.output_model), exist_ok=True)
        with open(args.output_model, "wb") as f:
            weights = {
                'w1': mlp.w1.T, 'b1': mlp.b1,
                'w2': mlp.w2.T, 'b2': mlp.b2,
                'labels': labels,
                'window_size': 1,
                'input_dim': X_train.shape[1],
                'feature_size': X_train.shape[1],
                'arch': 'mlp_multimodal_static'
            }
            if args.hidden_size_2 > 0:
                weights.update({'w3': mlp.w3.T, 'b3': mlp.b3})
            np.savez(f, **weights)
        print(f"Global model saved to {args.output_model}")

        if not args.skip_deploy:
            deploy_model(args.output_model, "app/assets")

        # 2. Train Per-Profile Models
        with open(args.manifest, "r") as f:
            manifest = json.load(f)
        
        profile_ids = sorted({e.get("profileId") for e in manifest.get("entries", []) if e.get("profileId")})
        
        for profile_id in profile_ids:
            print(f"\n=== Training Model for Profile: {profile_id} ===")
            try:
                X_train_p, y_train_p, X_test_p, y_test_p, label_to_idx_p, X_full_p, y_full_p = prepare_data(
                    args.manifest, args.augmentation_factor, args.test_split, profile_id_filter=profile_id
                )
                
                mlp_p = MLP(X_train_p.shape[1], args.hidden_size, len(label_to_idx_p), args.hidden_size_2)
                mlp_p.train(X_train_p, y_train_p, args.epochs, args.learning_rate, verbose=True)
                evaluate_detailed(mlp_p, X_test_p, y_test_p, label_to_idx_p, title=f"Profile {profile_id} Evaluation")
                
                # Save Profile Model
                profile_model_path = os.path.join(os.path.dirname(args.output_model), f"amy_model_{profile_id}.npz")
                labels_p = sorted(label_to_idx_p.keys())
                with open(profile_model_path, "wb") as f:
                    weights_p = {
                        'w1': mlp_p.w1.T, 'b1': mlp_p.b1,
                        'w2': mlp_p.w2.T, 'b2': mlp_p.b2,
                        'labels': labels_p,
                        'window_size': 1,
                        'input_dim': X_train_p.shape[1],
                        'feature_size': X_train_p.shape[1],
                        'arch': 'mlp_multimodal_static'
                    }
                    if args.hidden_size_2 > 0:
                        weights_p.update({'w3': mlp_p.w3.T, 'b3': mlp_p.b3})
                    np.savez(f, **weights_p)
                print(f"Profile model saved to {profile_model_path}")
                
            except Exception as pe:
                print(f"Warning: Failed to train model for profile {profile_id}: {pe}")

        except Exception as e:

            print(f"Error: {e}")

            import traceback

            traceback.print_exc()

            sys.exit(1)

    

    if __name__ == "__main__":

        main()

    