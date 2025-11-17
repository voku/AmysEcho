# Quick Start: Gesture Recognition System

## What This System Does

Amy's Echo uses **custom AI models** to recognize hand gestures. The system:
1. **Records** your gestures in the mobile app
2. **Uploads** training data to a server
3. **Trains** a personalized neural network model
4. **Downloads** the trained model back to your device
5. **Recognizes** your gestures in real-time

## Prerequisites

- **Node.js** 18+ 
- **Python** 3.8+
- **npm** or **yarn**
- **Android Studio** or **Xcode** (for mobile app)

## Setup

### 1. Install Dependencies

```bash
# App dependencies
cd app
npm ci

# Server dependencies
cd ../server
npm ci
pip install -r requirements.txt

# Integration tests
cd ../integration
npm ci
```

### 2. Start the Server

```bash
cd server
npm run build
npm start

# Server runs on http://localhost:5000
# Default token: demo-token
```

### 3. Run the Mobile App

#### Android Emulator
```bash
cd app
export EXPO_PUBLIC_API_URL=http://10.0.2.2:5000
export EXPO_PUBLIC_API_TOKEN=demo-token
npm run android
```

#### iOS Simulator
```bash
cd app
export EXPO_PUBLIC_API_URL=http://localhost:5000
export EXPO_PUBLIC_API_TOKEN=demo-token
npm run ios
```

#### Physical Device (with adb reverse)
```bash
# Terminal 1: Port forwarding
./scripts/adb-reverse.sh 5000

# Terminal 2: Start app
cd app
export EXPO_PUBLIC_API_TOKEN=demo-token
npm run android
```

## Using the System

### Step 1: Create a Profile
1. Open the app
2. Tap "Neues Profil erstellen" (Create new profile)
3. Enter a name (e.g., "Amy")
4. Tap "Profil erstellen"

### Step 2: Record Training Samples
1. Navigate to "Lernen" tab (Learning)
2. Select a gesture to train (e.g., "HILFE" - Help)
3. Tap "Aufnehmen" (Record)
4. Show the gesture to the camera for 3-5 seconds
5. Tap "Stoppen" (Stop)
6. Repeat 5-10 times for better accuracy

### Step 3: Upload and Train
- Training bundles automatically upload when WiFi is available
- Server automatically trains the model after upload
- No manual steps needed!

### Step 4: Use Recognition
1. Navigate to "Erkennen" tab (Recognition)
2. Show your trained gesture to the camera
3. The app will speak the recognized gesture
4. Confidence score is displayed

## Verifying the System Works

### Test 1: Server Endpoints
```bash
# Check server is running
curl http://localhost:5000/model-version \
  -H "Authorization: Bearer demo-token"

# Expected: {"version": "...", "path": "..."}
```

### Test 2: Upload a Training Bundle
```bash
# Create a test bundle (requires AdmZip)
cd integration
npm test

# All tests should pass
```

### Test 3: Train a Model
```bash
cd server
python3 src/amyserver_tools/train_mlp.py

# Expected output: JSON training report
```

### Test 4: Download a Model
```bash
curl "http://localhost:5000/latest-mlp-model?profileId=test" \
  -H "Authorization: Bearer demo-token" \
  -o test-model.npz

# Verify the file
python3 -c "import numpy as np; m = np.load('test-model.npz'); print('Labels:', m['labels'])"
```

## Architecture at a Glance

```
┌────────────┐         ┌────────────┐         ┌────────────┐
│   Mobile   │─upload─▶│   Server   │─train──▶│    Model   │
│    App     │         │    API     │         │   (.npz)   │
│            │◀download─│            │◀────────│            │
└────────────┘         └────────────┘         └────────────┘
     │                                               │
     │  Uses model for                               │
     │  real-time recognition                        │
     └───────────────────────────────────────────────┘
```

## Key Files

### Mobile App
- `app/src/screens/TrainingScreen.tsx` - Record gestures
- `app/src/screens/RecognitionScreen.tsx` - Real-time recognition
- `app/src/components/MediaPipeGestureDetector.tsx` - Hand detection
- `app/src/services/trainingBundleService.ts` - Create upload bundles
- `app/src/services/dgsModelClient.ts` - Download models

### Server
- `server/src/routes/trainingBundleRoute.ts` - Upload endpoint
- `server/src/amyserver_tools/train_mlp.py` - Model training
- `server/src/routes/latestMlpModelRoute.ts` - Model serving
- `server/data/models/` - Trained model storage

## Troubleshooting

### Problem: App can't connect to server
**Solution**: 
- Check server is running: `curl http://localhost:5000/model-version`
- Verify `EXPO_PUBLIC_API_URL` is set correctly
- For Android emulator, use `10.0.2.2` instead of `localhost`
- For physical device, use `adb reverse` or your computer's LAN IP

### Problem: Training samples not uploading
**Solution**:
- Check WiFi is enabled (cellular won't work)
- Verify `EXPO_PUBLIC_API_TOKEN` matches server token
- Check app logs for error messages
- Server logs: `data/uploads/` directory should have new folders

### Problem: Model not improving
**Solution**:
- Record at least 10 samples per gesture
- Vary lighting, background, hand position
- Check training output: `python3 src/amyserver_tools/train_mlp.py`
- Look for accuracy in training report

### Problem: Recognition is slow
**Solution**:
- MediaPipe needs 20-30ms for landmark detection (normal)
- Total recognition should be <50ms
- Check device performance (older devices may be slower)
- Reduce video resolution in WebView settings

## Environment Variables

### App
- `EXPO_PUBLIC_API_URL` - Server URL (default: http://localhost:5000)
- `EXPO_PUBLIC_API_TOKEN` - Auth token (default: demo-token)

### Server
- `PORT` - Server port (default: 5000)
- `API_TOKEN` - Authentication token (default: demo-token)
- `MLP_EPOCHS` - Training epochs (default: 500)
- `MLP_HIDDEN_SIZE` - Hidden layer neurons (default: 128)
- `MLP_LEARNING_RATE` - Learning rate (default: 0.01)
- `MLP_DATA_DIR` - Data directory (default: server/data)

## Running Tests

```bash
# App tests
cd app
npm test
# Expected: 910 tests passing

# Server tests
cd server
npm test
# Expected: 96 tests passing

# Integration tests
cd integration
npm test
# Expected: 6 tests passing
```

## Next Steps

1. **Read Full Documentation**: See `docs/CORE_GESTURE_RECOGNITION.md`
2. **Understand Architecture**: See `docs/CodebaseOverview.md`
3. **Development Workflow**: See `docs/DEVELOPMENT_WORKFLOW.md`
4. **Testing Strategy**: See `docs/TESTING_STRATEGY.md`

## Support

For issues or questions, check:
- Project TODO: `docs/TODO.md`
- Troubleshooting: `docs/Troubleshooting.md`
- Architecture Decisions: `docs/ArchitectureDecisions.md`
