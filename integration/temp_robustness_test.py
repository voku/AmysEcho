
import numpy as np
import sys

model_path = sys.argv[1]

try:
    with np.load(model_path) as data:
        w1 = data['w1']
        b1 = data['b1']
        w2 = data['w2']
        b2 = data['b2']
        labels = data['labels']

    # Test with different input scales
    scales = [0.1, 0.5, 1.0, 2.0, 5.0]
    results = []

    for scale in scales:
        test_input = np.random.randn(1, w1.shape[1]) * scale

        # Forward pass
        z1 = np.maximum(0, np.dot(test_input, w1) + b1)
        z2 = np.dot(z1, w2) + b2
        probs = np.exp(z2 - np.max(z2, axis=1, keepdims=True))
        probs = probs / np.sum(probs, axis=1, keepdims=True)

        max_prob = np.max(probs)
        results.append(max_prob)

    # Check that predictions are reasonable across scales
    avg_confidence = np.mean(results)
    confidence_std = np.std(results)

    print(f"ROBUSTNESS: {avg_confidence:.3f},{confidence_std:.3f}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
