
import numpy as np
import psutil
import os
import sys

model_path = sys.argv[1]

try:
    process = psutil.Process(os.getpid())
    initial_memory = process.memory_info().rss / 1024 / 1024  # MB

    # Load model
    with np.load(model_path) as data:
        w1 = data['w1']
        b1 = data['b1']
        w2 = data['w2']
        b2 = data['b2']
        labels = data['labels']

    model_loaded_memory = process.memory_info().rss / 1024 / 1024

    # Test inference
    test_input = np.random.randn(10, w1.shape[1]) * 0.1
    z1 = np.maximum(0, np.dot(test_input, w1) + b1)
    z2 = np.dot(z1, w2) + b2
    probs = np.exp(z2 - np.max(z2, axis=1, keepdims=True))
    probs = probs / np.sum(probs, axis=1, keepdims=True)

    inference_memory = process.memory_info().rss / 1024 / 1024

    memory_delta = inference_memory - initial_memory

    print(f"MEMORY: {initial_memory:.1f},{model_loaded_memory:.1f},{inference_memory:.1f},{memory_delta:.1f}")

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
