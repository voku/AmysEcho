
import numpy as np
import time
import sys

model_path = sys.argv[1]
num_samples = int(sys.argv[2]) if len(sys.argv) > 2 else 100

try:
    with np.load(model_path) as data:
        w1 = data['w1']
        b1 = data['b1']
        w2 = data['w2']
        b2 = data['b2']
        labels = data['labels']

    # Generate test data
    test_inputs = np.random.randn(num_samples, w1.shape[1]) * 0.1

    # Measure inference time
    start_time = time.time()

    # Batch inference
    z1 = np.maximum(0, np.dot(test_inputs, w1) + b1)
    z2 = np.dot(z1, w2) + b2
    probs = np.exp(z2 - np.max(z2, axis=1, keepdims=True))
    probs = probs / np.sum(probs, axis=1, keepdims=True)
    predictions = np.argmax(probs, axis=1)

    end_time = time.time()
    total_time = end_time - start_time
    avg_time = total_time / num_samples
    fps = num_samples / total_time

    print(f"PERFORMANCE: {avg_time:.4f},{fps:.1f},{total_time:.4f}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
