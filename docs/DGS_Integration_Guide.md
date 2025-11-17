# German Sign Language (DGS) Integration Guide

This guide provides comprehensive documentation for the German Sign Language gesture recognition integration in Amy's Echo, covering the complete pipeline from data collection to production deployment.

**Project Status:** All major features for the DGS integration have been implemented. The focus is now on optimization, bug fixing, and production readiness. This document reflects the current state of the project and the established integration pipeline.

## Overview

The DGS integration enables Amy's Echo to recognize 12 essential German Sign Language gestures optimized for children's communication needs:

- **alle** (all) - General communication
- **blau** (blue) - Color identification
- **rot** (red) - Color identification
- **gelb** (yellow) - Color identification
- **gruen** (green) - Color identification
- **essen** (eat) - Basic needs
- **trinken** (drink) - Basic needs
- **satt** (full/satisfied) - Status communication
- **spielen** (play) - Activity indication
- **schwester** (sister) - Family relationships
- **nochmal** (again) - Repetition requests
- **fertig** (finished/done) - Completion indication

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Native  │    │   WebView       │    │   Server API    │
│   App           │◄──►│   Gesture       │◄──►│   Model Serving  │
│                 │    │   Detector      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MediaPipe     │    │   MLP Model     │    │   Training      │
│   Hand Tracking │    │   (126→128→12) │    │   Pipeline       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Flow

1. **Video Processing**: Raw DGS videos → MediaPipe landmark extraction
2. **Training Data**: 126 input features (21 landmarks × 3 coordinates × 2 hands)
3. **Model Training**: MLP with 128 hidden units, 12 output classes
4. **Model Serving**: NPZ weights served via REST API with caching
5. **App Integration**: WebView loads model, performs real-time inference
6. **Fallback Chain**: MLP → Rule-based → Emergency gestures

## Data Collection & Processing

### Video Dataset Preparation

The system processes DGS video datasets to extract training data:

```bash
# Process DGS videos and extract landmarks
python scripts/process_dgs_videos.py \
  --input /path/to/dgs/videos \
  --output /path/to/training/data \
  --gestures alle,blau,rot,gelb,gruen,essen,trinken,satt,spielen,schwester,nochmal,fertig
```

### Training Data Format

Each training sample contains:
- **Input**: 126 features (21 hand landmarks × 3 coordinates × 2 hands)
- **Output**: One-hot encoded gesture class (12 classes)
- **Metadata**: Gesture name, confidence score, timestamp

```json
{
  "gesture": "blau",
  "landmarks": [0.1, 0.2, 0.0, ...], // 126 values
  "confidence": 0.95,
  "timestamp": 1700000000000
}
```

### Model Training

Train the MLP model using the prepared dataset:

```bash
# Prepare and train DGS model
python scripts/prepare_default_model.py \
  --data /path/to/training/data \
  --output server/data/dgs_model.npz \
  --config server/data/model_config.json
```

**Model Architecture**:
- Input Layer: 126 neurons (hand landmarks)
- Hidden Layer: 128 neurons with ReLU activation
- Output Layer: 12 neurons with softmax
- Loss Function: Categorical cross-entropy
- Optimizer: Adam with learning rate decay

## Server Integration

### Model Serving Endpoints

#### GET /latest-mlp-model
Download the trained MLP model weights.

**Parameters**:
- `profileId` (optional): Profile-specific model
- `X-Profile-Id` header: Required for profile-specific requests

**Response Headers**:
- `ETag`: SHA256 hash for caching
- `X-Model-Version`: Timestamp-based version
- `Content-Disposition`: `attachment; filename="dgs_model.npz"`

#### GET /model-metadata
Retrieve model metadata and validation information.

**Response**:
```json
{
  "version": "1.0.0",
  "size": 15432,
  "sha256": "a1b2c3...",
  "type": "mlp",
  "gestures": ["alle", "blau", "rot", ...],
  "lastModified": 1700000000000,
  "inputShape": [126],
  "outputShape": [12]
}
```

### Training Pipeline

#### POST /prepare-dgs-model
Trigger DGS model preparation from video datasets.

**Request**:
```json
{
  "datasetPath": "/videos/dgs",
  "gestures": ["alle", "blau", "rot", "gelb", "gruen"],
  "outputPath": "/models/dgs"
}
```

**Response**:
```json
{
  "status": "queued",
  "jobId": "dgs-prep-123",
  "estimatedDuration": "30m"
}
```

## App Integration

### WebView Model Loading

The React Native app loads the DGS model into the WebView gesture detector:

```typescript
// Load DGS model from server
const modelResponse = await fetch('/latest-mlp-model', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const modelBuffer = await modelResponse.arrayBuffer();
const modelWeights = new Float32Array(modelBuffer);

// Initialize MLP classifier
const classifier = new MLPClassifier({
  inputSize: 126,
  hiddenSize: 128,
  outputSize: 12,
  weights: modelWeights
});
```

### Real-time Inference

The WebView performs gesture recognition at 30+ FPS:

```typescript
// Process hand landmarks
const landmarks = extractHandLandmarks(frame);
const features = normalizeLandmarks(landmarks); // → 126 features

// Classify gesture
const prediction = classifier.predict(features);
const gesture = GESTURES[prediction.index];

// Send result to React Native
window.ReactNativeWebView.postMessage(JSON.stringify({
  type: 'gesture',
  gesture: gesture,
  confidence: prediction.confidence
}));
```

### Fallback Strategy

Multi-layer fallback ensures continuous operation:

1. **Primary**: MLP model inference
2. **Secondary**: Rule-based gesture detection
3. **Emergency**: Hardcoded critical gestures (always available)

## Testing & Validation

### Performance & Stability Testing

`integration/test/api.test.js` boots the production server build, uploads a
training bundle, waits for the Python trainer to emit weights, and finally
downloads the resulting model. Run the full suite with:

```bash
npm test --prefix integration
```

The test ensures training jobs complete within the configured timeout, the
resulting `.npz` file is readable, and cached responses stay in sync with the
files on disk. Review `integration/test-output.log` after a run to inspect
assertions, HTTP payloads, and timing data captured by the suite.

### Integration Testing

The same suite also exercises the APIs that power the caregiver app:

- `POST /train-model` rejects malformed payloads with `400` and accepts valid
  samples with `{ jobId, status }` JSON bodies.
- `GET /model-version` and `GET /latest-mlp-model` respond with concrete
  metadata (`200 { version, checksum }`) and binary payloads (NPZ bytes plus
  `Content-Length`, `ETag`, `Content-Disposition`).
- `POST /api/v1/dgs/sample-bundles` stores uploads (`201` with bundle id) and
  auto-triggers training.

All of these checks run via `npm test --prefix integration`, so no extra test
names or runner flags are required.

### Security Testing

While the suite focuses on real behavior instead of mocks, it still validates
that invalid payloads, missing headers, and unexpected states return proper
error codes: malformed JSON returns `400`, missing `Authorization` headers hit
`401`, forbidden profile ids hit `403`, and missing models respond with `404`.
Keeping everything inside `integration/test/api.test.js` means we only maintain
logic that actually interacts with the live server build.

## Deployment & CI/CD

### GitHub Actions Workflow

The CI/CD pipeline automates DGS integration testing:

```yaml
# .github/workflows/dgs-integration.yml
name: DGS Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20]
        python: ['3.10']

    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python }}

      - name: Install dependencies
        run: |
          npm ci --prefix app
          npm ci --prefix server
          npm ci --prefix integration
          pip install -r server/requirements.txt

      - name: Run DGS tests
        run: npm test --prefix integration
```

### Production Deployment

Deploy the DGS integration to production:

```bash
# 1. Train and validate model
python scripts/prepare_default_model.py

# 2. Run integration tests
npm test --prefix integration

# 3. Configure environment + database
export GESTURE_AUTH_TOKEN=... # caregiver API token
export AMY_ECHO_DATA_DIR=/var/lib/amysecho
mkdir -p "$AMY_ECHO_DATA_DIR"
[ -f "$AMY_ECHO_DATA_DIR/db.json" ] || printf '{}' > "$AMY_ECHO_DATA_DIR/db.json"
npm run build --prefix server

# 4. Deploy server with new model
npm start --prefix server
curl http://localhost:5000/health

# 5. Update app with new model support
npm run build:webview --prefix app
```

## Monitoring & Maintenance

### Model Performance Monitoring

Track DGS model performance in production:

```typescript
// Telemetry collection
const telemetry = {
  gesture: detectedGesture,
  confidence: prediction.confidence,
  latency: processingTime,
  modelVersion: modelMetadata.version,
  timestamp: Date.now()
};

// Send to server for analysis
await fetch('/api/telemetry', {
  method: 'POST',
  body: JSON.stringify(telemetry)
});
```

### Model Updates

Seamless model updates without service interruption:

```typescript
// Background model refresh
const checkForUpdates = async () => {
  const metadata = await fetch('/model-metadata');
  if (metadata.version !== currentVersion) {
    const newModel = await fetch('/latest-mlp-model');
    await loadNewModel(newModel);
    currentVersion = metadata.version;
  }
};

// Check every 5 minutes
setInterval(checkForUpdates, 5 * 60 * 1000);
```

## Troubleshooting

### Common Issues

#### Model Download Failures
```bash
# Check server logs
tail -f server/logs/dgs-model.log

# Verify authentication
curl -H "Authorization: Bearer $TOKEN" /latest-mlp-model
```

#### Poor Recognition Accuracy
```bash
# Validate training data quality
python scripts/validate_training_data.py --data /training/data

# Check model configuration
cat server/data/model_config.json
```

#### WebView Integration Issues
```bash
# Check WebView console logs
adb logcat | grep "WebView"

# Validate model injection
console.log('Model loaded:', modelWeights.length);
```

### Performance Optimization

#### Memory Management
- Implement model weight quantization for reduced memory usage
- Use WebGL acceleration for GPU-based inference
- Implement frame skipping during high CPU load

#### Latency Optimization
- Pre-compute landmark normalization matrices
- Use WebAssembly for compute-intensive operations
- Implement confidence thresholding to reduce false positives

## Future Enhancements

### Extended Gesture Set
- Add more DGS gestures for expanded vocabulary
- Implement gesture combinations for complex expressions
- Support for regional DGS variations

### Advanced Features
- Real-time gesture sequence recognition
- Personalized model adaptation per user
- Multi-hand gesture support
- Gesture velocity and acceleration analysis

### Performance Improvements
- ONNX model format for cross-platform compatibility
- TensorFlow.js integration for WebGL acceleration
- Model pruning and quantization for mobile optimization

---

This guide provides the foundation for maintaining and extending the DGS integration. For specific implementation details, refer to the source code and test suites.