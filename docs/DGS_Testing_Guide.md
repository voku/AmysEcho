# DGS Integration Testing Guide

This guide documents the comprehensive test suite for the German Sign Language integration in Amy's Echo, covering performance, security, accessibility, and integration testing.

**Project Status:** All major features for the DGS integration have been implemented. The focus is now on optimization, bug fixing, and production readiness. This document reflects the current state of the project and the established testing pipeline.

## Test Suite Overview

The DGS integration includes a multi-layered testing approach with 7 specialized test suites:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Performance    │    │   Security      │    │ Accessibility  │
│   Testing       │    │   Testing       │    │   Testing      │
│                 │    │                 │    │                │
│ • Latency <10ms │    │ • File integrity│    │ • WCAG AA/AAA  │
│ • FPS >50       │    │ • Path traversal│    │ • Screen reader│
│ • Memory <50MB  │    │ • Input validation│  │ • Keyboard nav │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Integration    │    │   E2E Testing   │    │ Video Processing│
│   Testing       │    │                 │    │   Testing       │
│                 │    │ • Full pipeline │    │                │
│ • Data flow     │    │ • Model updates │    │ • Landmark ext │
│ • API endpoints │    │ • Fallbacks     │    │ • Training data │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Performance Testing

### Inference Latency Validation

**File**: `integration/test/dgs_performance.spec.ts`

**Purpose**: Ensures real-time gesture recognition performance requirements are met.

**Test Cases**:
- **Latency Test**: Validates average inference time < 10ms per frame
- **FPS Test**: Ensures > 50 frames per second processing capability
- **Memory Test**: Confirms memory usage < 50MB during operation
- **Robustness Test**: Validates consistent performance across input scales

**Requirements**:
```typescript
// Performance thresholds
const REQUIREMENTS = {
  maxLatency: 0.01,    // 10ms per frame
  minFPS: 50,          // 50+ FPS
  maxMemoryMB: 50,     // 50MB memory limit
  maxConfidenceStd: 0.5 // Confidence stability
};
```

**Execution**:
```bash
npm test --prefix integration -- dgs_performance
```

### Memory Efficiency Testing

**Test Implementation**:
```python
# Memory usage measurement
initial_memory = process.memory_info().rss / 1024 / 1024
# Load model and perform inference
model_loaded_memory = process.memory_info().rss / 1024 / 1024
memory_delta = model_loaded_memory - initial_memory
assert memory_delta < 50, f"Memory usage: {memory_delta}MB"
```

## Security Testing

### File Integrity Validation

**File**: `integration/test/dgs_security.spec.ts`

**Purpose**: Ensures model files are secure and haven't been tampered with.

**Test Cases**:
- **File Size Validation**: Checks model file size is within reasonable bounds
- **Permission Security**: Validates file permissions prevent unauthorized access
- **Path Traversal Protection**: Prevents directory traversal attacks
- **Input Sanitization**: Validates all inputs are properly sanitized

**Security Checks**:
```typescript
// File integrity validation
assert(stats.size > 1000, 'Model file too small');
assert(stats.size < 100 * 1024 * 1024, 'Model file too large');
assert((mode & 0o022) === 0, 'Insecure file permissions');
```

### Authorization Testing

**Test Cases**:
- **Profile-Based Access**: Validates per-user model authorization
- **Token Validation**: Ensures proper authentication for model downloads
- **Header Verification**: Checks X-Profile-Id header requirements

## Accessibility Testing

### WCAG Compliance Validation

**File**: `integration/test/dgs_accessibility.spec.ts`

**Purpose**: Ensures the DGS integration meets accessibility standards for users with disabilities.

**Test Cases**:
- **Keyboard Navigation**: Tests keyboard-only gesture triggering
- **High Contrast Support**: Ensures visibility in high contrast modes
- **Focus Management**: Validates proper focus indicators
- **Screen Reader Support**: *Alpha-Scope Hinweis – derzeit ausgesetzt*

**Accessibility Requirements**:
```typescript
const ACCESSIBILITY_CHECKS = {
  keyboardNavigation: true,
  highContrast: true,
  focusManagement: true,
  ariaLabels: true,
  screenReader: false // Alpha release excludes screen reader verification
};
```

### Cognitive Accessibility

**Specialized Tests for 22q11 Syndrome**:
- **Simplified Feedback**: Validates clear, encouraging error messages
- **Visual Consistency**: Ensures consistent gesture visualization
- **Audio Cues**: Tests optional audio feedback for gesture detection
- **Reduced Cognitive Load**: Validates minimal UI complexity

## Integration Testing

### Data Flow Validation

**File**: `integration/test/dgs_integration.spec.ts`

**Purpose**: Tests the complete data pipeline from video processing to model serving.

**Test Cases**:
- **Video Processing**: Validates landmark extraction from DGS videos
- **Training Data**: Ensures proper data formatting and normalization
- **Model Training**: Tests MLP training pipeline
- **Model Serving**: Validates API endpoints and caching
- **WebView Integration**: Tests model loading and inference

**Integration Flow**:
```typescript
// Complete pipeline test
const testPipeline = async () => {
  // 1. Process training videos
  await processDGSVideos(inputPath, outputPath);

  // 2. Train model
  await trainMLPModel(trainingData, modelConfig);

  // 3. Serve model via API
  await serveModel(modelPath, apiConfig);

  // 4. Load in WebView
  await loadModelInWebView(modelUrl);

  // 5. Perform inference
  const result = await performInference(testLandmarks);
  assert(result.confidence > 0.8, 'Low confidence detection');
};
```

### API Endpoint Testing

**Test Coverage**:
- **GET /latest-mlp-model**: Model download with range requests
- **GET /model-metadata**: Metadata retrieval and validation
- **POST /prepare-dgs-model**: Model preparation workflow
- **GET /train-status**: Training progress monitoring

## End-to-End Testing

### Full Pipeline Validation

**File**: `integration/test/dgs_e2e.spec.ts`

**Purpose**: Tests the complete user journey from gesture to recognition.

**Test Scenarios**:
- **Model Download**: Background model fetching and caching
- **WebView Loading**: Model injection and initialization
- **Real-time Recognition**: Live gesture detection and classification
- **Fallback Activation**: Automatic fallback when primary systems fail
- **Error Recovery**: Graceful handling of network issues

**E2E Test Flow**:
```typescript
const e2eTest = async () => {
  // Setup test environment
  await setupTestServer();
  await setupTestWebView();

  // Test complete recognition pipeline
  const gestureResult = await performFullRecognition(testVideo);

  // Validate results
  assert(gestureResult.detected, 'Gesture not detected');
  assert(gestureResult.confidence > 0.7, 'Low confidence');
  assert(gestureResult.latency < 100, 'High latency');
};
```

### Video Processing Testing

**File**: `integration/test/dgs_video_processing.spec.ts`

**Purpose**: Validates video-to-landmark processing pipeline.

**Test Cases**:
- **Video Loading**: Supports multiple video formats
- **Landmark Extraction**: Accurate 21-point hand landmark detection
- **Data Normalization**: Proper coordinate normalization
- **Batch Processing**: Efficient processing of video datasets
- **Error Handling**: Graceful handling of corrupted videos

## CI/CD Integration

### GitHub Actions Workflow

**File**: `.github/workflows/dgs-integration.yml`

**Configuration**:
```yaml
name: DGS Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20]
        python: [3.8, 3.10]

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

      - name: Run DGS Tests
        run: npm test --prefix integration -- --grep "dgs"
```

### Test Execution

**Local Testing**:
```bash
# Run all DGS tests
npm test --prefix integration -- --grep "dgs"

# Run specific test suite
npm test --prefix integration -- dgs_performance
npm test --prefix integration -- dgs_security
npm test --prefix integration -- dgs_accessibility

# Run with coverage
npm test --prefix integration -- --coverage --grep "dgs"
```

**Performance Baselines**:
```json
{
  "performance": {
    "latency": "< 10ms",
    "fps": "> 50",
    "memory": "< 50MB",
    "accuracy": "> 90%"
  },
  "security": {
    "fileIntegrity": "validated",
    "pathTraversal": "protected",
    "authorization": "enforced"
  },
  "accessibility": {
    "wcagLevel": "AA",
    "keyboardNav": "enabled",
    "screenReader": "out_of_scope"
  }
}
```

## Test Maintenance

### Adding New Test Cases

**Template for New Tests**:
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('New DGS Test Suite', () => {
  test('should validate new functionality', async () => {
    // Test implementation
    const result = await testFunction();
    assert(result.success, 'Test failed');
  });
});
```

### Test Data Management

**Test Assets**:
- Sample DGS video files for processing tests
- Pre-trained model files for performance validation
- Mock landmark data for unit testing
- Test configuration files for different environments

### Continuous Monitoring

**Performance Regression Detection**:
```typescript
// Automated performance monitoring
const monitorPerformance = async () => {
  const metrics = await runPerformanceTests();

  if (metrics.latency > THRESHOLD_LATENCY) {
    console.error('Performance regression detected');
    process.exit(1);
  }
};
```

## Troubleshooting Test Failures

### Common Issues

#### Model Not Available
```bash
# Generate test model
python scripts/prepare_default_model.py

# Or skip model-dependent tests
npm test --prefix integration -- --grep "dgs" --skip-model-tests
```

#### Performance Test Failures
```bash
# Check system resources
top  # Monitor CPU/memory
python -c "import psutil; print(psutil.cpu_percent())"

# Run isolated performance test
npm test --prefix integration -- dgs_performance --verbose
```

#### Integration Test Timeouts
```bash
# Increase timeout for slow tests
npm test --prefix integration -- --timeout 60000

# Check server logs
tail -f server/logs/dgs-integration.log
```

### Debug Mode Testing

**Verbose Test Output**:
```bash
# Run with detailed logging
DEBUG=dgs:* npm test --prefix integration -- dgs_integration

# Check WebView console
adb logcat | grep "WebView"
```

This comprehensive test suite ensures the DGS integration maintains high performance, security, and accessibility standards while providing reliable gesture recognition for Amy's communication needs.