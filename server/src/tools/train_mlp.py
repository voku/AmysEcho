#!/usr/bin/env python3

import json
import os
from collections import defaultdict

import numpy as np

# --- Config ---
DATASET_PATH = os.environ.get(
    "MLP_DATASET_PATH",
    os.path.join(os.path.dirname(__file__), "../../data/dgs_samples.json"),
)
MODEL_PATH = os.environ.get(
    "MLP_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "../../data/dgs_model.npz"),
)
HIDDEN_SIZE = int(os.environ.get("MLP_HIDDEN_SIZE", "128"))
LEARNING_RATE = float(os.environ.get("MLP_LEARNING_RATE", "0.01"))
EPOCHS = int(os.environ.get("MLP_EPOCHS", "500"))

# --- Normalization (must match recognizer) ---
def _normalize(lm):
    """Normalize one or two hands to be wrist-centered and scale-invariant."""
    if not lm or len(lm) < 21:
        return None

    pts = np.array(lm[:42], dtype=float)
    two_hands = len(pts) >= 42 and len(lm) >= 42
    if len(pts) < 42:
        pad = np.zeros((42 - len(pts), 3))
        pts = np.vstack([pts, pad])

    def _norm_hand(hand: np.ndarray) -> np.ndarray | None:
        wrist = hand[0]
        hand = hand - wrist
        max_dist = np.max(np.sum(np.abs(hand[:, :2]), axis=1))
        if max_dist == 0:
            return None
        hand /= max_dist
        return hand

    left = _norm_hand(pts[:21])
    right = _norm_hand(pts[21:])
    if left is None:
        return None
    if right is None:
        if two_hands:
            return None
        right = np.zeros_like(pts[:21])

    return np.concatenate([left, right]).flatten()

# --- MLP Implementation (NumPy) ---
def relu(x):
    return np.maximum(0, x)

def relu_derivative(x):
    return np.where(x > 0, 1, 0)

def softmax(x):
    e_x = np.exp(x - np.max(x, axis=1, keepdims=True))
    return e_x / np.sum(e_x, axis=1, keepdims=True)

def train_mlp(X, y, output_size):
    print(f"Training MLP for {EPOCHS} epochs...")

    input_size = X.shape[1]

    # Initialize weights
    w1 = np.random.randn(input_size, HIDDEN_SIZE) * 0.01
    b1 = np.zeros((1, HIDDEN_SIZE))
    w2 = np.random.randn(HIDDEN_SIZE, output_size) * 0.01
    b2 = np.zeros((1, output_size))

    num_samples = X.shape[0]

    for epoch in range(EPOCHS):
        # --- Forward Pass ---
        z1 = np.dot(X, w1) + b1
        a1 = relu(z1)
        z2 = np.dot(a1, w2) + b2
        probs = softmax(z2)

        # --- Loss (Cross-Entropy) ---
        log_probs = -np.log(probs[np.arange(num_samples), y])
        loss = np.sum(log_probs) / num_samples

        # --- Backward Pass ---
        dz2 = probs
        dz2[np.arange(num_samples), y] -= 1
        dz2 /= num_samples

        dw2 = np.dot(a1.T, dz2)
        db2 = np.sum(dz2, axis=0, keepdims=True)

        da1 = np.dot(dz2, w2.T)
        dz1 = da1 * relu_derivative(z1)
        
        dw1 = np.dot(X.T, dz1)
        db1 = np.sum(dz1, axis=0, keepdims=True)

        # --- Update Weights ---
        w1 -= LEARNING_RATE * dw1
        b1 -= LEARNING_RATE * db1
        w2 -= LEARNING_RATE * dw2
        b2 -= LEARNING_RATE * db2

        print(json.dumps({"type": "progress", "current": epoch + 1, "total": EPOCHS, "loss": f"{loss:.4f}"}), flush=True)
            
    return w1, b1, w2, b2

# --- Main ---
def main():
    print(f"Loading dataset from {DATASET_PATH}...")
    try:
        with open(DATASET_PATH, 'r') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Error: Dataset not found. Please create dgs_samples.json first.")
        return

    samples = data.get('samples', [])
    if not samples:
        print("No samples found in the dataset.")
        return

    # Preprocess data
    X_raw = []
    y_raw = []
    label_to_idx = {}
    idx_counter = 0

    for sample in samples:
        label = sample.get('label')
        landmarks = sample.get('landmarks')
        
        if not label or not landmarks:
            continue

        # Use middle frame of a sequence
        frame_to_process = landmarks
        if isinstance(landmarks[0][0], list):
            frame_to_process = landmarks[len(landmarks) // 2]

        normalized_lm = _normalize(frame_to_process)
        if normalized_lm is None:
            continue
            
        if label not in label_to_idx:
            label_to_idx[label] = idx_counter
            idx_counter += 1
            
        X_raw.append(normalized_lm)
        y_raw.append(label_to_idx[label])

    if not X_raw:
        print("No valid samples could be processed.")
        return

    X = np.array(X_raw)
    y = np.array(y_raw)
    
    print(f"Processed {len(X)} samples for {len(label_to_idx)} unique gestures.")

    # Train
    w1, b1, w2, b2 = train_mlp(X, y, len(label_to_idx))

    # Save model
    idx_to_label = {i: l for l, i in label_to_idx.items()}
    
    # Atomic write to avoid partial reads
    tmp_path = MODEL_PATH + ".tmp"
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    np.savez(tmp_path, w1=w1, b1=b1, w2=w2, b2=b2, idx_to_label=idx_to_label)
    # Replace atomically and set restrictive permissions
    os.replace(tmp_path, MODEL_PATH)
    try:
        os.chmod(MODEL_PATH, 0o640)
    except Exception:
        pass
    print(f"MLP model saved to {MODEL_PATH}")

if __name__ == "__main__":
    main()
