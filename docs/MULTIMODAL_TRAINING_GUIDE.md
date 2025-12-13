# Multimodal Training Guide - Complete Workflow

This guide explains how to train Amy's Echo with multimodal sign language data (hands + pose + face) and how the system automatically distributes personalized models.

## 🎯 Quick Start

### For Caregivers Using the App

1. **Record a Sign**:
   - Open the Training page in Amy's Echo app
   - Select a sign to record (e.g., "HALLO", "DANKE")
   - Position Amy so her hands, face, and upper body are visible
   - Press "Record" button
   - Perform the sign naturally
   - Press "Stop" when done

2. **Automatic Upload**:
   - The app automatically creates a training bundle with:
     - Hand landmarks (21 points per hand × 2 hands)
     - Pose landmarks (33 body points)
     - Face landmarks (468 facial points)
     - Video clip (when available)
   - Bundle uploads when Wi-Fi is available
   - No manual intervention needed!

3. **Automatic Model Training**:
   - Server processes new training bundles
   - Trains personalized model for Amy's profile
   - Also updates global DGS model

4. **Automatic Model Download**:
   - App checks for model updates every time it starts
   - Downloads personalized model automatically
   - Falls back to global model if personalized not available
   - Seamless - no user action required!

## 📊 What Data is Captured

### Multimodal Landmark Data

**Hand Landmarks** (126 features):
- Left hand: 21 landmarks × 3 coordinates (x, y, z) = 63 features
- Right hand: 21 landmarks × 3 coordinates (x, y, z) = 63 features
- Captured for every frame while recording

**Pose Landmarks** (99 features):
- 33 body points (shoulders, elbows, hips, etc.) × 3 coordinates
- Normalized to torso center
- Scaled by shoulder width for consistency
- Enables recognition of body movements and orientation

**Face Landmarks** (33 features):
- 11 key facial points (eyes, nose, lips, eyebrows, mouth corners)
- Critical for Non-Manual Markers (NMMs) in DGS
- Normalized to nose tip, scaled by eye distance
- Captures facial expressions essential for sign language grammar

### Total Feature Vector
- **Hand-only models**: 126 features (backward compatible)
- **Multimodal models**: 258 features (126 hands + 99 pose + 33 face)

## 🔄 Complete Training Workflow

### 1. Data Capture (Webapp/App)

```typescript
// When recording a sign:
interface TrainingFrame {
  landmarks: number[][][];        // Hand landmarks (2 hands)
  handedness?: string[];          // Which hand is which
  poseLandmarks?: number[][];     // Body pose (33 points)
  faceLandmarks?: number[][];     // Facial points (468 points)
}
```

### 2. Bundle Creation

The app automatically creates a ZIP bundle:

```
training-bundle-2024-12-13-amy.zip
├── metadata.json          # Profile ID, label, timestamp, source
├── landmarks.json         # All multimodal landmark data
│   ├── frames[]          # Array of TrainingFrame objects
│   └── metadata          # Modality coverage, smoothing config
└── clip.mp4              # Video recording (optional)
```

Example `landmarks.json`:
```json
{
  "frames": [
    {
      "landmarks": [...],           // 42 hand landmarks
      "handLandmarks": [...],       // Structured format
      "handedness": ["Left", "Right"],
      "poseLandmarks": [...],       // 33 pose landmarks
      "faceLandmarks": [...]        // 468 face landmarks
    }
  ],
  "metadata": {
    "modalities": {
      "hands": { "present": true, "frameCount": 45, "coverage": 1.0 },
      "pose": { "present": true, "frameCount": 45, "coverage": 1.0 },
      "face": { "present": true, "frameCount": 42, "coverage": 0.93 }
    },
    "smoothing": {
      "method": "one_euro",
      "minCutOff": 1.0,
      "beta": 0.05
    }
  }
}
```

### 3. Upload to Server

- App uploads bundle to `/api/v1/dgs/sample-bundles`
- Server validates and stores in `data/uploads/<profileId>/<timestamp>/`
- Registers in `data/datasets/training_manifest.json`

### 4. Model Training

#### Automatic Training Trigger

The server automatically trains when:
- New bundles are uploaded (configurable threshold)
- Manual trigger via `/train-model` endpoint
- Scheduled training (if configured)

#### Training Process

```bash
# Server runs this internally:
cd server
python src/amyserver_tools/train_mlp.py \
  --manifest data/datasets/training_manifest.json \
  --output-dir data/models
```

**What happens during training:**

1. **Data Loading**:
   - Reads all bundles from manifest
   - Extracts multimodal landmarks from `landmarks.json`
   - Falls back to video extraction if needed
   - Caches extracted landmarks for speed

2. **Feature Extraction**:
   - Detects if data has pose/face (enables multimodal mode)
   - Normalizes each modality:
     - Hands: wrist-centered, scale-invariant
     - Pose: torso-centered, shoulder-width scaled
     - Face: nose-centered, eye-distance scaled
   - Creates 258-dim feature vector (or 126 for hand-only)

3. **Model Training**:
   - Trains MLP with:
     - Input layer: 258 features (multimodal) or 126 (hand-only)
     - Hidden layer: 128 neurons (configurable)
     - Output layer: number of sign classes
     - ReLU activation, softmax output
   - Uses data augmentation for robustness
   - Early stopping to prevent overfitting

4. **Model Output**:
   - Global model: `data/models/global/amy_model.npz`
   - Profile models: `data/models/<profileId>/amy_model.npz`
   - Training report with accuracy metrics

### 5. Model Distribution

#### Server Endpoint

```typescript
GET /latest-mlp-model?profileId=amy
```

Response:
```json
{
  "weights": "base64-encoded-npz-file",
  "labels": ["HALLO", "DANKE", "BITTE", ...],
  "version": "2024-12-13-v2",
  "profileId": "amy",
  "modalities": ["hands", "pose", "face"],
  "inputSize": 258
}
```

#### Automatic Download in App

```typescript
// App automatically checks on startup:
const model = await fetchMlpModelWithFallback({
  endpoint: API_URL + '/latest-mlp-model',
  profileId: 'amy',
  token: userToken
});

// Model is loaded and ready for recognition!
```

**Download Logic:**
1. Try personalized model first (`?profileId=amy`)
2. If not available, fall back to global model
3. Cache model locally
4. Check version on each app start
5. Download update if new version available

## 🧪 Testing the Workflow

### Manual End-to-End Test

1. **Record Training Sample**:
   ```bash
   # In app or webapp:
   - Go to Training page
   - Select sign "TEST"
   - Record with hands, face, and body visible
   - Verify upload completes
   ```

2. **Trigger Training**:
   ```bash
   curl -X POST http://localhost:3001/train-model \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json"
   ```

3. **Check Training Status**:
   ```bash
   curl http://localhost:3001/train-status/JOB_ID \
     -H "Authorization: Bearer $TOKEN"
   ```

4. **Download Model**:
   ```bash
   curl "http://localhost:3001/latest-mlp-model?profileId=amy" \
     -H "Authorization: Bearer $TOKEN"
   ```

5. **Test Recognition**:
   - Perform the "TEST" sign in app
   - Verify it's recognized with your personalized model

### Automated Integration Test

See `integration/test/multimodal-training-flow.test.ts` (created below)

## 🎓 Training Best Practices

### For Best Recognition Results

1. **Lighting**: Ensure good, even lighting on face and hands
2. **Background**: Plain background helps landmark detection
3. **Framing**: Keep hands, face, and upper body in frame
4. **Consistency**: Record each sign 3-5 times from similar angles
5. **Variation**: Include slight variations in speed and position
6. **Natural**: Sign naturally as Amy would normally

### Data Quality Indicators

The system tracks:
- **Modality coverage**: % of frames with each modality
- **Landmark stability**: Smoothness of landmark tracks
- **Missing data**: Alerts if modalities frequently missing

Check metadata in uploaded bundles:
```json
{
  "modalities": {
    "hands": { "coverage": 1.0 },    // ✅ Perfect
    "pose": { "coverage": 0.95 },    // ✅ Good
    "face": { "coverage": 0.60 }     // ⚠️ Consider re-recording
  }
}
```

## 🔧 Troubleshooting

### Model Not Downloading

**Check:**
- Network connectivity
- API endpoint configuration
- User authentication token
- Server is running

**Debug:**
```javascript
// In browser console:
console.log('API URL:', import.meta.env.VITE_API_URL);
console.log('Token:', localStorage.getItem('authToken'));
```

### Training Fails

**Common causes:**
- Not enough training samples (need at least 2 per sign)
- Corrupted bundle data
- Python dependencies missing (mediapipe, opencv)

**Check logs:**
```bash
# Server logs:
tail -f server/logs/training.log

# Or check training report:
curl http://localhost:3001/train-status/JOB_ID
```

### Recognition Not Using Multimodal Data

**Verify:**
1. Model was trained with multimodal data
2. Model input size is 258 (not 126)
3. Webapp is passing pose/face landmarks

**Debug in browser console:**
```javascript
// Check if multimodal data is being captured:
window.__mlpPredict = function(hands, handedness, pose, face) {
  console.log('Pose landmarks:', pose?.length);
  console.log('Face landmarks:', face?.length);
  // ... original function
};
```

## 📈 Monitoring & Metrics

### Training Metrics

After training, check the report:
```json
{
  "accuracy": 0.95,
  "samples": 150,
  "labels": ["HALLO", "DANKE", ...],
  "modalities_used": ["hands", "pose", "face"],
  "feature_size": 258,
  "training_time_ms": 45000
}
```

### Recognition Metrics

The app tracks:
- Recognition confidence scores
- Fallback to global model frequency
- Model version in use
- Modality availability per frame

## 🚀 Advanced: Custom Training Parameters

### Environment Variables

```bash
# Server configuration:
export MLP_HIDDEN_SIZE=128      # Neural network size
export MLP_EPOCHS=500           # Training iterations
export MLP_LEARNING_RATE=0.01   # Learning speed
export MLP_DROPOUT_RATE=0.0     # Regularization
```

### Training with Specific Data

```bash
# Train only for specific profile:
python server/src/amyserver_tools/train_mlp.py \
  --profile-id amy \
  --min-samples 3

# Train with specific modalities:
# (Auto-detected from data, no flag needed)
```

## ✅ Success Checklist

- [ ] Can record signs with hands, face, and body visible
- [ ] Bundles upload successfully (check Wi-Fi)
- [ ] Training completes without errors
- [ ] Personalized model downloads to app
- [ ] Signs are recognized with good confidence (>0.7)
- [ ] Multimodal features improve accuracy vs hand-only

## 📚 Related Documentation

- [Video Recording Workflow](./VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
- [API Documentation](./API.md)
- [Testing Strategy](./TESTING_STRATEGY.md)
- [Development Workflow](./DEVELOPMENT_WORKFLOW.md)

---

**The system is fully automatic!** Caregivers just record signs, and Amy gets better at recognizing them automatically. 🎉
