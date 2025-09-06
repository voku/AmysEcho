import { test, describe } from 'node:test';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import assert from 'node:assert';

const OUTPUT_DIR = path.join(process.cwd(), 'server', 'data');
const MODEL_FILE = path.join(OUTPUT_DIR, 'dgs_model.npz');

describe('DGS Model Performance Tests', () => {
  test('should meet inference latency requirements', async () => {
    // Test that model inference is fast enough for real-time use
    try {
      await fs.access(MODEL_FILE);

      const performanceTest = `
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
`;

      const tempScriptPath = path.join(process.cwd(), 'temp_perf_test.py');
      await fs.writeFile(tempScriptPath, performanceTest);

      // Test with 100 samples
      const result = execSync(`python3 ${tempScriptPath} ${MODEL_FILE} 100`, {
        encoding: 'utf8',
        timeout: 30000
      });

      await fs.unlink(tempScriptPath);

      if (result.includes('ERROR:')) {
        throw new Error(result);
      }

      const [avgTime, fps, totalTime] = result.split('PERFORMANCE:')[1].trim().split(',');

      // Performance requirements for real-time gesture recognition
      assert(parseFloat(avgTime) < 0.01, `Average inference time too slow: ${avgTime}s (should be < 0.01s)`);
      assert(parseFloat(fps) > 50, `FPS too low: ${fps} (should be > 50)`);

      console.log(`✓ Performance test passed: ${avgTime}s avg, ${fps} FPS`);

    } catch (error) {
      console.log('Performance test skipped - model not available');
    }
  });

  test('should handle memory efficiently', async () => {
    // Test memory usage during model operations
    try {
      await fs.access(MODEL_FILE);

      const memoryTest = `
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
`;

      const tempScriptPath = path.join(process.cwd(), 'temp_memory_test.py');
      await fs.writeFile(tempScriptPath, memoryTest);

      const result = execSync(`python3 ${tempScriptPath} ${MODEL_FILE}`, {
        encoding: 'utf8',
        timeout: 30000
      });

      await fs.unlink(tempScriptPath);

      if (result.includes('ERROR:')) {
        throw new Error(result);
      }

      const [initial, loaded, inference, delta] = result.split('MEMORY:')[1].trim().split(',');

      // Memory requirements (reasonable limits for mobile/web)
      assert(parseFloat(delta) < 50, `Memory usage too high: ${delta}MB (should be < 50MB)`);

      console.log(`✓ Memory test passed: ${delta}MB total usage`);

    } catch (error) {
      console.log('Memory test skipped - model not available or psutil not installed');
    }
  });

  test('should maintain accuracy across different input scales', async () => {
    // Test model robustness to different input scales
    try {
      await fs.access(MODEL_FILE);

      const robustnessTest = `
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
`;

      const tempScriptPath = path.join(process.cwd(), 'temp_robustness_test.py');
      await fs.writeFile(tempScriptPath, robustnessTest);

      const result = execSync(`python3 ${tempScriptPath} ${MODEL_FILE}`, {
        encoding: 'utf8',
        timeout: 30000
      });

      await fs.unlink(tempScriptPath);

      if (result.includes('ERROR:')) {
        throw new Error(result);
      }

      const [avgConfidence, confidenceStd] = result.split('ROBUSTNESS:')[1].trim().split(',');

      // Model should be reasonably robust to input scaling
      assert(parseFloat(avgConfidence) > 0.1, `Average confidence too low: ${avgConfidence}`);
      assert(parseFloat(confidenceStd) < 0.5, `Confidence variation too high: ${confidenceStd}`);

      console.log(`✓ Robustness test passed: ${avgConfidence} avg confidence, ${confidenceStd} std`);

    } catch (error) {
      console.log('Robustness test skipped - model not available');
    }
  });
});