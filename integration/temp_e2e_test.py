
import numpy as np
import sys
model_path = sys.argv[1]
with np.load(model_path) as data:
    w1 = data['w1']
    b1 = data['b1']
    w2 = data['w2']
    b2 = data['b2']
    labels = data['labels']

test_input = np.random.randn(1, w1.shape[1]) * 0.1
z1 = np.maximum(0, np.dot(test_input, w1) + b1)
z2 = np.dot(z1, w2) + b2
probs = np.exp(z2 - np.max(z2, axis=1, keepdims=True))
probs = probs / np.sum(probs, axis=1, keepdims=True)
pred_idx = np.argmax(probs, axis=1)
print(f"Inference successful: {labels[pred_idx[0]]}")
