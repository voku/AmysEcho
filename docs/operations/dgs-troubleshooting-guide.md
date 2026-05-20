# DGS Integration Troubleshooting Guide

This guide provides solutions for common issues encountered with the German Sign Language integration in Amy's Echo, covering development, testing, and production scenarios.

## Quick Diagnosis Checklist

Before diving into specific issues, run this checklist.
**Note:** Some commands assume the server is running.

```bash
# 1. Check system status
npm test --prefix integration
# (optional quick filter)
npm test --prefix integration -- --grep "health"

# 2. Verify model file exists
ls -la server/data/models/global/amy_model.npz

# 3. Check server logs (if server is running)
tail -f server/data/training-debug.log

# 4. Test API endpoints (if server is running)
curl -H "Authorization: Bearer demo-token" http://localhost:5000/api/v1/models/metadata
```

## Model Training Issues

### Model Training Fails with Memory Errors

**Symptoms**:
```
MemoryError: Unable to allocate array with shape (100000, 126)
```

**Solutions**:

1. **Use Data Generator**:

If you have a large dataset, the `train_mlp.py` script may fail with memory errors. In this case, you can modify the script to use a data generator that loads data in batches.

```python
def data_generator(X, y, batch_size=32):
    while True:
        for i in range(0, len(X), batch_size):
            yield X[i:i+batch_size], y[i:i+batch_size]
```

2. **Enable Memory Optimization**:
```bash
# Set environment variables
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
export CUDA_VISIBLE_DEVICES=0
```

### Poor Model Accuracy

**Symptoms**:
- Accuracy < 70% on test set
- High false positive rate
- Gestures frequently misclassified

**Diagnostic Steps**:

1. **Check Training Data Quality**:
```python
# Validate landmark data
python -c "
import numpy as np
data = np.load('training_data.npy')
print('Data shape:', data.shape)
print('Data range:', data.min(), 'to', data.max())
print('NaN values:', np.isnan(data).sum())
"
```

2. **Analyze Class Distribution**:
```python
# Check for imbalanced classes
unique, counts = np.unique(labels, return_counts=True)
for gesture, count in zip(unique, counts):
    print(f'{gesture}: {count} samples')
```

**Solutions**:

1. **Balance Training Data**:

**Note:** This solution requires the `imblearn` library. You can install it using `pip install imblearn`.

```python
from imblearn.over_sampling import SMOTE
smote = SMOTE(random_state=42)
X_balanced, y_balanced = smote.fit_resample(X, y)
```

2. **Increase Model Capacity**:
```python
# Increase trainer layer sizes via environment variables
MLP_LAYER1_SIZE=768 MLP_LAYER2_SIZE=384 python server/src/amyserver_tools/train_mlp.py
```

3. **Add Data Augmentation**:
```python
def augment_landmarks(landmarks, noise_factor=0.01):
    noise = np.random.normal(0, noise_factor, landmarks.shape)
    return landmarks + noise
```

### Model File Corruption

**Symptoms**:
- `ValueError: Object arrays cannot be loaded when allow_pickle=False`
- Model loads but produces random predictions

**Solutions**:

1. **Regenerate Model**:
```bash
# Remove corrupted model
rm server/data/dgs_model.npz

# Regenerate
python scripts/prepare_default_model.py
```

2. **Validate Model Integrity**:
```python
import numpy as np

def validate_model(model_path):
    try:
        with np.load(model_path) as data:
            required_keys = ['w1', 'b1', 'w2', 'b2', 'labels']
            for key in required_keys:
                assert key in data, f'Missing {key}'
            print('Model validation passed')
    except Exception as e:
        print(f'Model validation failed: {e}')

validate_model('server/data/models/global/amy_model.npz')
```

## Webapp Gesture Pipeline Issues

### Gesture Detection Not Working

**Symptoms**:
- Camera activates but no gestures detected
- Browser console shows MediaPipe errors
- Webapp crashes when opening camera

**Diagnostic Steps**:

1. **Check Browser Console**:
```javascript
// Add for debugging
console.log('MediaPipe version:', mp.version);
console.log('Camera permissions:', navigator.permissions.query({name: 'camera'}));
```

2. **Validate Model Loading**:
```javascript
// Check if model loaded correctly
console.log('Model weights length:', modelWeights.length);
console.log('Expected size:', 126 * 128 + 128 + 128 * 12 + 12);
```

**Solutions**:

1. **Fix MediaPipe Loading**:
```javascript
// Ensure MediaPipe assets are available in webapp/src/gesture
// Rebuild if the vision bundle is outdated.
```

2. **Handle Camera Permissions**:
```javascript
async function requestCameraPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }
    });
    return stream;
  } catch (error) {
    console.error('Camera permission denied:', error);
    throw error;
  }
}
```

3. **Verify Model Injection**:
```typescript
// In the webapp, useMlpModelInjection handles injection.
// Check that window.__setMlpModelB64 is available and returns true.
```

### Performance Issues

**Symptoms**:
- Frame rate drops below 20 FPS
- High latency (>50ms per frame)
- App becomes unresponsive

**Diagnostic Steps**:

1. **Monitor Performance**:
```javascript
// Add performance monitoring
const startTime = performance.now();
// ... gesture processing ...
const endTime = performance.now();
console.log(`Processing time: ${endTime - startTime}ms`);
```

2. **Check Memory Usage**:
```javascript
// Monitor memory in the browser
if (performance.memory) {
  console.log('Memory usage:', {
    used: performance.memory.usedJSHeapSize,
    total: performance.memory.totalJSHeapSize,
    limit: performance.memory.jsHeapSizeLimit
  });
}
```

**Solutions**:

1. **Optimize Frame Processing**:
```javascript
// Skip frames when processing is slow
let lastProcessedTime = 0;
const PROCESS_INTERVAL = 1000 / 30; // 30 FPS

function processFrame(frame) {
  const now = Date.now();
  if (now - lastProcessedTime < PROCESS_INTERVAL) {
    return; // Skip frame
  }
  lastProcessedTime = now;
  // Process frame...
}
```

2. **Reduce Model Precision**:
```javascript
// Use lower precision for faster inference
const modelWeightsFloat16 = modelWeights.map(w => Math.fround(w));
```

3. **Implement Frame Pooling**:
```javascript
// Reuse canvas and image data objects
const framePool = [];
function getFrameBuffer() {
  return framePool.pop() || new ImageData(640, 480);
}
```

## Server API Issues

### Model Download Failures

**Symptoms**:
- `404 Not Found` for model endpoints
- `403 Forbidden` for profile-specific models
- Slow download speeds

**Diagnostic Steps**:

1. **Check Server Logs**:
```bash
tail -f server/logs/server.log | grep -i model
```

2. **Test API Endpoints**:
```bash
# Test model metadata
curl -v http://localhost:5000/api/v1/models/metadata \
  -H "Authorization: Bearer demo-token"

# Test model download
curl -v http://localhost:5000/api/v1/models/latest \
  -H "Authorization: Bearer demo-token" \
  -o test_model.npz
```

**Solutions**:

1. **Fix Authentication**:
```javascript
// Ensure proper token format
const token = localStorage.getItem('authToken');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

2. **Handle Profile Authorization**:
```bash
# For profile-specific models
curl http://localhost:5000/api/v1/models/latest?profileId=user123 \
  -H "Authorization: Bearer token" \
  -H "X-Profile-Id: user123"
```

3. **Optimize Download Performance**:
```javascript
// Implement resumable downloads
const response = await fetch(modelUrl, {
  headers: {
    'Range': `bytes=${startByte}-${endByte}`
  }
});
```

### Training Job Failures

**Symptoms**:
- Training jobs stuck in "running" state
- `500 Internal Server Error` during training
- Training completes but model accuracy is poor

**Diagnostic Steps**:

1. **Check Training Logs**:
```bash
tail -f server/logs/training.log
```

2. **Monitor Training Progress**:
```bash
curl http://localhost:5000/api/v1/train-status?jobId=abc123
```

**Solutions**:

1. **Fix Training Configuration**:
```json
// Ensure proper training config
{
  "epochs": 100,
  "batchSize": 32,
  "learningRate": 0.001,
  "validationSplit": 0.2
}
```

2. **Handle Training Timeouts**:
```javascript
// Set reasonable timeouts
const trainingTimeout = 30 * 60 * 1000; // 30 minutes
setTimeout(() => {
  console.error('Training timeout');
  cancelTraining(jobId);
}, trainingTimeout);
```

## Testing Issues

### Test Suite Failures

**Symptoms**:
- Tests fail with "model not available"
- Performance tests exceed thresholds
- Integration tests timeout

**Solutions**:

1. **Generate Test Model**:
```bash
# Ensure test model exists
python scripts/prepare_default_model.py

# Verify model
ls -la server/data/models/global/amy_model.npz
```

2. **Fix Performance Baselines**:
```typescript
// Adjust test thresholds based on hardware
const PERFORMANCE_THRESHOLDS = {
  latency: process.env.CI ? 0.015 : 0.010, // More lenient for CI
  fps: process.env.CI ? 40 : 50,
  memoryMB: 60
};
```

3. **Handle Test Timeouts**:
```bash
# Increase test timeouts for slow environments
npm test --prefix integration -- --test-timeout=120000
```

### CI/CD Pipeline Issues

**Symptoms**:
- GitHub Actions fail with dependency errors
- Matrix testing doesn't work properly
- Artifacts not uploaded correctly

**Solutions**:

1. **Fix Dependency Caching**:
```yaml
# Ensure proper cache keys
- uses: actions/cache@v3
  with:
    key: ${{ runner.os }}-node-${{ matrix.node-version }}-${{ hashFiles('package-lock.json') }}
```

2. **Handle Matrix Failures**:
```yaml
# Allow individual matrix jobs to fail
continue-on-error: true
strategy:
  fail-fast: false
```

3. **Debug CI Environment**:
```bash
# Add debug logging
- name: Debug environment
  run: |
    node --version
    npm --version
    python --version
    pip list
```

## Production Issues

### Memory Leaks

**Symptoms**:
- App memory usage grows over time
- Performance degrades during extended use
- App crashes after prolonged usage

**Solutions**:

1. **Implement Proper Cleanup**:
```javascript
// Clean up MediaPipe resources
function dispose() {
  if (hands) {
    hands.close();
  }
  if (camera) {
    camera.stop();
  }
  // Clear model weights
  modelWeights = null;
}
```

2. **Monitor Memory Usage**:
```javascript
// Add memory monitoring
setInterval(() => {
  if (performance.memory) {
    const usage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
    if (usage > 0.8) {
      console.warn('High memory usage detected');
      // Trigger cleanup
      dispose();
    }
  }
}, 30000);
```

### Network Issues

**Symptoms**:
- Model downloads fail in poor connectivity
- Real-time sync doesn't work offline
- App fails to recover from network interruptions

**Solutions**:

1. **Implement Offline Mode**:
```javascript
// Cache model locally
async function cacheModel() {
  const model = await fetchModel();
  await localStorage.setItem('cachedModel', model);
}

// Use cached model when offline
async function getModel() {
  if (navigator.onLine) {
    return await fetchModel();
  } else {
    return await localStorage.getItem('cachedModel');
  }
}
```

2. **Add Retry Logic**:
```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

## Emergency Troubleshooting

### Complete System Reset

When all else fails, perform a complete reset:

```bash
# 1. Stop all services
pkill -f "node.*server"
pkill -f "vite"

# 2. Clear caches and models
rm -rf server/data/models/global/amy_model.npz
rm -rf webapp/node_modules/.cache
rm -rf server/node_modules/.cache

# 3. Reinstall dependencies
npm ci --prefix webapp
npm ci --prefix server
npm ci --prefix integration

# 4. Trigger training if needed
curl -X POST http://localhost:5000/api/v1/train-model \
  -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"bundles"}'

# 5. Restart services
npm start --prefix server &
npm run dev --prefix webapp
```

### Debug Mode Activation

Enable comprehensive debugging:

```bash
# Environment variables
export DEBUG=dgs:*
export NODE_ENV=development
export DGS_LOG_LEVEL=debug

# Use browser devtools for client debugging.
```

### Log Collection

Collect comprehensive logs for support:

```bash
# Create debug archive
tar -czf debug_logs.tar.gz \
  server/logs/*.log \
  integration/test-output.log \
  /tmp/dgs_debug.log
```

## Getting Help

If issues persist:

1. **Check Existing Issues**: Search GitHub issues for similar problems
2. **Collect Debug Info**: Run the diagnostic checklist above
3. **Create Minimal Reproduction**: Isolate the issue in a minimal test case
4. **File a Bug Report**: Include logs, environment info, and reproduction steps

Remember: The DGS integration is designed with Amy-first principles - every issue should be approached with the goal of maintaining communication capabilities even during technical problems.
