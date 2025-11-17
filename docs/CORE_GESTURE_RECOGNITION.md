# Core Gesture Recognition System

## Overview

Amy's Echo's core feature is a **personalized hand gesture recognition system** powered by a custom MLP (Multi-Layer Perceptron) neural network. The system allows users to train their own gesture models that improve over time.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MOBILE APP                            │
│  ┌──────────────────┐     ┌──────────────────┐             │
│  │ RecognitionScreen│────▶│ MediaPipe WebView│             │
│  │ (Real-time)      │     │ (Hand Detection) │             │
│  └──────────────────┘     └──────────────────┘             │
│           │                        │                         │
│           ▼                        ▼                         │
│  ┌──────────────────┐     ┌──────────────────┐             │
│  │  TrainingScreen  │────▶│  Record Samples  │             │
│  │ (Capture)        │     │  (Landmarks+Vid) │             │
│  └──────────────────┘     └──────────────────┘             │
│                                    │                         │
│                                    ▼                         │
│                           ┌──────────────────┐              │
│                           │ Training Bundle  │              │
│                           │ (ZIP: metadata+  │              │
│                           │  landmarks+clip) │              │
│                           └──────────────────┘              │
└────────────────────────────────────│────────────────────────┘
                                     │
                                     │ Upload via WiFi
                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                         SERVER                               │
│  ┌──────────────────┐                                       │
│  │  /api/v1/dgs/    │                                       │
│  │ sample-bundles   │──┐                                    │
│  └──────────────────┘  │                                    │
│                        │ Validate & Extract                  │
│                        ▼                                     │
│  ┌─────────────────────────────────┐                       │
│  │   training_manifest.json        │                       │
│  │   (Registry of all samples)     │                       │
│  └─────────────────────────────────┘                       │
│                        │                                     │
│                        │ Training Trigger                    │
│                        ▼                                     │
│  ┌──────────────────────────────────────┐                  │
│  │      train_mlp.py (Python)           │                  │
│  │  • Load samples from manifest         │                  │
│  │  • Train MLP (126 inputs → 256 hidden│                  │
│  │    → N gesture outputs)               │                  │
│  │  • Generate global model (all users)  │                  │
│  │  • Generate per-profile models        │                  │
│  └──────────────────────────────────────┘                  │
│                        │                                     │
│                        ▼                                     │
│  ┌─────────────────────────────────────┐                   │
│  │  Model Artifacts (.npz files)        │                   │
│  │  • global/amy_model.npz              │                   │
│  │  • <profileId>/amy_model.npz         │                   │
│  └─────────────────────────────────────┘                   │
│                        │                                     │
│                        │ Download Request                    │
│                        ▼                                     │
│  ┌──────────────────────────────────────┐                  │
│  │  /latest-mlp-model?profileId=X       │                  │
│  │  (Serves personalized or global)     │                  │
│  └──────────────────────────────────────┘                  │
└────────────────────────────────│────────────────────────────┘
                                 │
                                 │ Download
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                        MOBILE APP                            │
│  ┌──────────────────────────────────────┐                  │
│  │   MLP Inference (WebView)            │                  │
│  │   • Load model weights (.npz)        │                  │
│  │   • Classify hand landmarks          │                  │
│  │   • Real-time gesture recognition    │                  │
│  └──────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### App Side

#### 1. MediaPipe Gesture Detection
**File**: `app/src/components/MediaPipeGestureDetector.tsx`  
**Purpose**: Real-time hand landmark detection using MediaPipe in WebView  
**Tech**: MediaPipe Hands (21 landmarks per hand, 2 hands max = 42 landmarks × 3 coords = 126 features)

#### 2. Training Screen
**File**: `app/src/screens/TrainingScreen.tsx`  
**Purpose**: Record training samples for gestures  
**Captures**:
- Hand landmarks (JSON array of 3D coordinates)
- Video clip (MP4/WebM format)
- Metadata (profileId, label, timestamp)

#### 3. Training Bundle Service
**File**: `app/src/services/trainingBundleService.ts`  
**Purpose**: Create ZIP bundles for upload  
**Contents**:
```
bundle.zip
├── metadata.json      # Profile, label, timestamp
├── landmarks.json     # Hand landmark frames
├── clip.mp4          # Video recording (optional)
└── still.jpg         # Reference frame (optional)
```

#### 4. Training Sync
**File**: `app/src/services/trainingSync.ts`  
**Purpose**: Queue and upload bundles to server  
**Features**:
- WiFi detection (no longer requires charging)
- Retry logic with exponential backoff
- Queue management in AsyncStorage

#### 5. Model Client
**File**: `app/src/services/dgsModelClient.ts`  
**Purpose**: Download and cache trained models  
**Features**:
- Profile-specific model requests
- Global model fallback
- Local caching with version tracking
- ETag-based updates

#### 6. Recognition Screen
**File**: `app/src/screens/RecognitionScreen.tsx`  
**Purpose**: Real-time gesture recognition  
**Features**:
- Continuous landmark detection
- MLP inference in WebView
- Confidence scoring
- Multi-gesture sequences

### Server Side

#### 1. Training Bundle Endpoint
**File**: `server/src/routes/trainingBundleRoute.ts`  
**Endpoint**: `POST /api/v1/dgs/sample-bundles`  
**Purpose**: Receive and validate training bundles  
**Validation**:
- ZIP structure check
- landmarks.json presence and format
- Minimum frame count
- Path traversal prevention

#### 2. Training Bundle Ingestor
**File**: `server/src/services/trainingBundleIngestor.ts`  
**Purpose**: Extract samples from bundles into training manifest  
**Output**: Updates `data/datasets/training_manifest.json`

#### 3. MLP Trainer
**File**: `server/src/amyserver_tools/train_mlp.py`  
**Purpose**: Train neural network from samples  
**Architecture**:
```python
Input Layer:  126 features (42 landmarks × 3 coords)
Hidden Layer: 256 neurons (configurable via MLP_HIDDEN_SIZE)
Output Layer: N gestures (dynamic based on training data)
```

**Training Process**:
1. Load samples from `training_manifest.json`
2. Normalize landmarks (wrist-centered, scaled)
3. Split by profile for personalized models
4. Train with gradient descent (500 epochs default)
5. Save weights as `.npz` files

**Configuration** (via environment variables):
- `MLP_HIDDEN_SIZE`: Hidden layer neurons (default: 128)
- `MLP_LEARNING_RATE`: Learning rate (default: 0.01)
- `MLP_EPOCHS`: Training iterations (default: 500)
- `MLP_DROPOUT_RATE`: Dropout for regularization (default: 0.0)
- `MLP_EARLY_STOPPING_PATIENCE`: Stop if no improvement (optional)

#### 4. Model Serving
**File**: `server/src/routes/latestMlpModelRoute.ts`  
**Endpoint**: `GET /latest-mlp-model?profileId=<id>`  
**Purpose**: Serve personalized or global models  
**Headers**:
- `X-Model-Version`: Timestamp of model file
- `X-Model-Source`: "profile" or "global"
- `X-Checksum-SHA256`: File integrity check
- `ETag`: For caching

**Fallback Strategy**:
1. Try per-profile model: `data/models/<profileId>/amy_model.npz`
2. Fall back to global: `data/models/global/amy_model.npz`
3. Generate zero-initialized model if none exists

## Complete Training Loop

### Phase 1: Sample Recording (App)
```typescript
// User opens TrainingScreen
// Selects gesture: "HILFE" (HELP)
// Starts recording
MediaPipeGestureDetector.startClipCapture()
// Records for 3-5 seconds
// Captures landmarks + video
MediaPipeGestureDetector.stopClipCapture()
// Saves locally
saveTrainingSample(sample)
```

### Phase 2: Bundle Creation (App)
```typescript
// Background sync triggered
const bundle = await createTrainingBundle({
  profileId: "amy-profile-001",
  label: "HILFE",
  landmarks: [...],
  clipUri: "file:///.../clip.mp4"
})
// ZIP created with metadata + landmarks + clip
```

### Phase 3: Upload (App → Server)
```typescript
// WiFi detected, upload starts
await uploadTrainingBundle(bundle)
// POST to /api/v1/dgs/sample-bundles
// Server returns 200 OK
```

### Phase 4: Ingestion (Server)
```bash
# Server extracts ZIP
mkdir -p data/uploads/<profileId>/<timestamp>
unzip bundle.zip -d data/uploads/<profileId>/<timestamp>
# Validates landmarks.json
# Updates training_manifest.json
```

### Phase 5: Training (Server)
```bash
# Automatic or manual trigger
python3 src/amyserver_tools/train_mlp.py

# Loads samples from manifest
# Trains global model (all users)
# Trains per-profile model (one user)
# Outputs:
#   data/models/global/amy_model.npz
#   data/models/<profileId>/amy_model.npz
```

### Phase 6: Model Download (Server → App)
```typescript
// App requests updated model
const model = await fetchMlpModel(profileId)
// GET /latest-mlp-model?profileId=amy-profile-001
// Server returns personalized model
// App caches in FileSystem
```

### Phase 7: Recognition (App)
```typescript
// User shows gesture to camera
MediaPipeGestureDetector.onGestureDetected((gesture, confidence, landmarks) => {
  // MLP inference in WebView
  // Returns: { gesture: "HILFE", confidence: 0.87 }
  // Triggers speech output and visual feedback
})
```

## Model Personalization

### Global Model
- **Path**: `data/models/global/amy_model.npz`
- **Training Data**: All samples from all users
- **Use Case**: Baseline recognition for new users
- **Shared**: Yes, cached on CDN

### Per-Profile Model
- **Path**: `data/models/<profileId>/amy_model.npz`
- **Training Data**: Only samples from this specific user
- **Use Case**: Personalized recognition for individual users
- **Shared**: No, private to user

### Fallback Chain
```
1. Try per-profile model
   └─ If not found ─┐
2. Use global model  │
   └─ If not found ─┘
3. Generate zero-initialized model
   (Neutral weights, no predictions)
```

## Data Flow Example

### Example: Training "HILFE" (Help) Gesture

**1. App Records Sample**
```json
{
  "profileId": "amy-001",
  "label": "HILFE",
  "landmarks": [
    // Frame 1
    { "landmarks": [[0.5, 0.3, 0.1], [0.52, 0.31, 0.11], ...], "weight": 1.0 },
    // Frame 2
    { "landmarks": [[0.51, 0.3, 0.1], [0.53, 0.31, 0.11], ...], "weight": 1.0 },
    // ... more frames
  ],
  "clipUri": "file:///path/to/clip.mp4",
  "capturedAt": "2024-05-28T12:03:11Z"
}
```

**2. Server Receives Bundle**
```bash
data/uploads/amy-001/1716897791000/
├── bundle.zip
├── metadata.json
├── landmarks.json
└── clip.mp4
```

**3. Training Manifest Updated**
```json
{
  "version": "1.0",
  "entries": [
    {
      "id": "amy-001-1716897791000",
      "profileId": "amy-001",
      "label": "HILFE",
      "storage": {
        "path": "data/uploads/amy-001/1716897791000",
        "files": ["metadata.json", "landmarks.json", "clip.mp4"]
      },
      "metadata": {
        "capturedAt": "2024-05-28T12:03:11Z",
        "validationSummary": {
          "frameCount": 42,
          "landmarksPath": "data/uploads/amy-001/1716897791000/landmarks.json"
        }
      }
    }
  ]
}
```

**4. Model Trained**
```python
# train_mlp.py processes samples
# For amy-001 profile:
#   - 10 samples of "HILFE"
#   - 8 samples of "SPIELEN"
#   - 5 samples of "ESSEN"
# Trains MLP with 3 output classes
# Saves to data/models/amy-001/amy_model.npz
```

**5. App Uses Model**
```typescript
// User shows HILFE gesture
// MediaPipe detects landmarks
// MLP predicts: { gesture: "HILFE", confidence: 0.92 }
// App speaks: "Hilfe!"
```

## Testing the System

### Unit Tests
- **App**: `npm test --prefix app` (910 tests)
- **Server**: `npm test --prefix server` (96 tests)

### Integration Test
- **Location**: `integration/test/api.test.js`
- **Covers**: Complete upload → train → download cycle

### Manual Testing
```bash
# 1. Start server
cd server
npm run build
npm start

# 2. Upload a test bundle
curl -X POST http://localhost:5000/api/v1/dgs/sample-bundles \
  -H "Authorization: Bearer demo-token" \
  -F "bundle=@test-bundle.zip"

# 3. Trigger training
curl -X POST http://localhost:5000/train-model \
  -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" \
  -d '{"samples": [...]}'

# 4. Download model
curl -X GET "http://localhost:5000/latest-mlp-model?profileId=test" \
  -H "Authorization: Bearer demo-token" \
  -o model.npz

# 5. Verify model file
python3 -c "import numpy as np; m = np.load('model.npz'); print(m.files)"
```

## Performance Characteristics

### Inference Speed
- **Target**: <50ms per gesture (real-time)
- **Actual**: ~10-30ms on modern devices
- **Bottleneck**: MediaPipe landmark detection (20-30ms)
- **MLP inference**: <5ms

### Training Time
- **Small dataset** (50 samples): ~5 seconds
- **Medium dataset** (500 samples): ~30 seconds
- **Large dataset** (5000 samples): ~3 minutes
- **Factors**: Number of epochs, hidden layer size

### Model Size
- **Typical**: 100-500 KB per model
- **Max observed**: ~2 MB for large vocabulary
- **Download time**: <2 seconds on 3G

## Scalability Considerations

### For Many Users
1. **Per-profile models**: Each user gets personalized weights
2. **Global model**: Shared baseline for cold start
3. **CDN caching**: Global models cached at edge
4. **Incremental training**: Update models without full retrain

### Data Storage
```
data/
├── uploads/              # Training bundles
│   ├── profile-001/      # ~10 MB per 100 samples
│   ├── profile-002/
│   └── ...
├── models/               # Trained weights
│   ├── global/           # ~500 KB
│   └── profile-001/      # ~500 KB per profile
└── datasets/
    └── training_manifest.json  # ~100 KB per 1000 samples
```

### Recommended Cleanup
- Archive bundles older than 90 days
- Keep last 1000 samples per profile
- Regenerate models monthly with active data

## Security & Privacy

### Data Protection
- **Local storage**: Encrypted using device keychain
- **Upload**: HTTPS only, bearer token auth
- **Server storage**: Per-profile isolation
- **Model serving**: Profile-specific access control

### GDPR Compliance
- **Right to access**: Export all user data
- **Right to deletion**: Remove profile bundles and models
- **Data minimization**: Only store essential training data

## Troubleshooting

### "No model found" error
**Cause**: No trained model exists yet  
**Solution**: Server auto-generates zero-initialized model on first request

### Low recognition accuracy
**Cause**: Insufficient training samples  
**Solution**: Record at least 10 samples per gesture, vary conditions

### Upload failures
**Cause**: No WiFi, server unreachable  
**Solution**: App queues bundles, retries automatically

### Training takes too long
**Cause**: Too many epochs or large dataset  
**Solution**: Reduce `MLP_EPOCHS` environment variable (default: 500)

### Model not updating
**Cause**: Cache not invalidated  
**Solution**: Check ETag headers, clear app cache

## Future Enhancements

- [ ] Real-time training feedback in app
- [ ] Model accuracy metrics display
- [ ] Active learning (suggest gestures to record)
- [ ] Transfer learning from global to profile models
- [ ] Multi-user gesture sequences
- [ ] Gesture composition (combine basic gestures)

## References

- **MediaPipe Hands**: https://google.github.io/mediapipe/solutions/hands
- **MLP Training**: `server/src/amyserver_tools/train_mlp.py`
- **WebView Detector**: `app/webview/gestureDetector.ts`
- **Architecture Docs**: `docs/CodebaseOverview.md`
