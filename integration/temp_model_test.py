
import numpy as np
import sys
import os

model_path = sys.argv[1]
try:
    with np.load(model_path) as data:
        w1 = data['w1']
        b1 = data['b1']
        w2 = data['w2']
        b2 = data['b2']
        labels = data['labels']

    print(f"Model loaded: {w1.shape} -> {w2.shape}, classes: {len(labels)}")

    # Test inference with dummy data
    test_input = np.random.randn(1, w1.shape[1]) * 0.1

    # Forward pass
    z1 = np.maximum(0, np.dot(test_input, w1) + b1)
    z2 = np.dot(z1, w2) + b2
    probs = np.exp(z2 - np.max(z2, axis=1, keepdims=True))
    probs = probs / np.sum(probs, axis=1, keepdims=True)
    pred_idx = np.argmax(probs, axis=1)

    print(f"Inference test passed: predicted class {pred_idx[0]} with confidence {probs[0][pred_idx[0]]:.3f}")
    print("SUCCESS")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
