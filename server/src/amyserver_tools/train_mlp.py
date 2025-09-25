#!/usr/bin/env python3

import json
import os
import sys

import numpy as np

# --- Config ---
DATASET_PATH = os.environ.get(
    "MLP_DATASET_PATH",
    os.path.join(os.path.dirname(__file__), "../../../data/dgs_samples.json"),
)
MODEL_PATH = os.environ.get(
    "MLP_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "../../../data/amy_model.npz"),
)
HIDDEN_SIZE = int(os.environ.get("MLP_HIDDEN_SIZE", "128"))
LEARNING_RATE = float(os.environ.get("MLP_LEARNING_RATE", "0.01"))
EPOCHS = int(os.environ.get("MLP_EPOCHS", "500"))


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
    b1 = np.zeros(HIDDEN_SIZE)
    w2 = np.random.randn(HIDDEN_SIZE, output_size) * 0.01
    b2 = np.zeros(output_size)

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
        db2 = np.sum(dz2, axis=0)

        da1 = np.dot(dz2, w2.T)
        dz1 = da1 * relu_derivative(z1)

        dw1 = np.dot(X.T, dz1)
        db1 = np.sum(dz1, axis=0)

        # --- Update Weights ---
        w1 -= LEARNING_RATE * dw1
        b1 -= LEARNING_RATE * db1
        w2 -= LEARNING_RATE * dw2
        b2 -= LEARNING_RATE * db2

        print(
            json.dumps(
                {
                    "type": "progress",
                    "current": epoch + 1,
                    "total": EPOCHS,
                    "loss": f"{loss:.4f}",
                }
            ),
            flush=True,
        )

    return w1, b1, w2, b2


# --- Main ---
def main():
    print(f"Loading dataset from {DATASET_PATH}...")
    try:
        with open(DATASET_PATH, "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Error: Dataset not found. Please create dgs_samples.json first.")
        return

    samples = data.get("samples", [])
    if not samples:
        print("No samples found in the dataset.")
        return

    # Preprocess data
    X_raw = []
    y_raw = []
    label_to_idx = {}
    idx_counter = 0

    for sample in samples:
        label = sample.get("label")
        landmarks = sample.get("landmarks")

        if not label or not landmarks:
            continue

        # Use middle frame of a sequence
        frame_to_process = landmarks
        if isinstance(landmarks[0], list):
            if len(landmarks[0]) == 3:
                # Structured format: list of [x,y,z] points - flatten it
                frame_to_process = [coord for point in landmarks for coord in point]
            elif isinstance(landmarks[0][0], list):
                # Sequence format: list of frames, each frame is list of [x,y,z] points
                frame_to_process = landmarks[len(landmarks) // 2]
                if isinstance(frame_to_process[0], list) and len(frame_to_process[0]) == 3:
                    frame_to_process = [coord for point in frame_to_process for coord in point]
            if isinstance(frame_to_process[0], list) and len(frame_to_process[0]) == 3:
                frame_to_process = [coord for point in frame_to_process for coord in point]

        normalized_lm = _normalize(frame_to_process)
        if normalized_lm is None:
            # Debug: print why normalization failed
            print(f"DEBUG: Normalization failed for {label}, frame_to_process type: {type(frame_to_process)}, len: {len(frame_to_process) if hasattr(frame_to_process, '__len__') else 'N/A'}", file=sys.stderr)
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

    # Report simple training metrics
    z1 = relu(np.dot(X, w1) + b1)
    z2 = np.dot(z1, w2) + b2
    probs = softmax(z2)
    preds = np.argmax(probs, axis=1)
    acc = float(np.mean(preds == y))
    print(
        json.dumps(
            {
                "type": "metrics",
                "samples": len(X),
                "classes": len(label_to_idx),
                "accuracy": f"{acc:.4f}",
            }
        ),
        flush=True,
    )

    # Save model with labels array for WebView compatibility
    labels = sorted(label_to_idx.keys())

    # Atomic write to avoid partial reads
    tmp_path = MODEL_PATH + ".tmp"
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(tmp_path, "wb") as f:
        np.savez(f, w1=np.array(w1.T, order='C'), b1=b1, w2=np.array(w2.T, order='C'), b2=b2, labels=np.array(labels))
    # Replace atomically and set restrictive permissions
    os.replace(tmp_path, MODEL_PATH)
    try:
        os.chmod(MODEL_PATH, 0o640)
    except Exception:
        pass
    print(f"MLP model saved to {MODEL_PATH}")


if __name__ == "__main__":
    main()
