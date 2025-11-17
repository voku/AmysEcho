# Getting Started with Gesture Recognition

## 🎯 What You'll Build

A hand gesture recognition system that:
1. Learns YOUR gestures
2. Trains a personal AI model
3. Recognizes your gestures in real-time

**Time to first gesture**: ~10 minutes

---

## 📋 Prerequisites

Before you start:
- [ ] Computer with macOS, Linux, or Windows
- [ ] Node.js 18+ installed ([download](https://nodejs.org/))
- [ ] Python 3.8+ installed ([download](https://www.python.org/))
- [ ] Android Studio or Xcode (for mobile app)
- [ ] 5 GB free disk space

**Quick Check:**
```bash
node --version   # Should show v18 or higher
python3 --version # Should show 3.8 or higher
```

---

## 🚀 Quick Start (5 Commands)

### 1. Get the Code
```bash
git clone https://github.com/voku/AmysEcho.git
cd AmysEcho
```

### 2. Verify Everything Works
```bash
./scripts/verify-gesture-system.sh
```

This takes ~3 minutes and checks:
- ✅ Dependencies installed
- ✅ All 1012 tests pass
- ✅ Type checking passes
- ✅ Training pipeline works

**Expected output**: "All checks passed! The gesture recognition system is working."

### 3. Start the Server
```bash
cd server
npm run build
npm start
```

Server runs on http://localhost:5000

### 4. Run the Mobile App

**Option A: Android Emulator**
```bash
# Terminal 1: Keep server running
# Terminal 2:
cd app
export EXPO_PUBLIC_API_URL=http://10.0.2.2:5000
export EXPO_PUBLIC_API_TOKEN=demo-token
npm run android
```

**Option B: Physical Android Device**
```bash
# Terminal 1: Keep server running
# Terminal 2: Port forwarding
./scripts/adb-reverse.sh 5000

# Terminal 3: Run app
cd app
export EXPO_PUBLIC_API_TOKEN=demo-token
npm run android
```

**Option C: iOS Simulator**
```bash
# Terminal 1: Keep server running
# Terminal 2:
cd app
export EXPO_PUBLIC_API_URL=http://localhost:5000
export EXPO_PUBLIC_API_TOKEN=demo-token
npm run ios
```

---

## 🎓 Training Your First Gesture

### Step 1: Create a Profile
1. Open the app
2. Tap "Neues Profil erstellen" (Create new profile)
3. Enter your name
4. Tap "Profil erstellen"

### Step 2: Record Training Samples

**Pick a simple gesture to start:**
- 👍 Thumbs up
- 👋 Open palm (wave)
- ✌️ Peace sign

**Record it:**
1. Navigate to "Lernen" tab (bottom navigation)
2. Select your gesture from the list
3. Tap "Aufnehmen" (Record)
4. Show your gesture to the camera for 3-5 seconds
5. Keep your hand steady and well-lit
6. Tap "Stoppen" (Stop)

**Repeat 5 times:**
- Vary the angle slightly each time
- Keep consistent lighting
- Same hand position

### Step 3: Wait for Training

The app automatically:
1. ✅ Creates a training bundle (ZIP with landmarks + video)
2. ✅ Queues it for upload
3. ✅ Uploads when WiFi is available
4. ✅ Server trains your model
5. ✅ App downloads the updated model

**You'll see**: "Neues Modell verfügbar" (New model available)

### Step 4: Test Recognition

1. Navigate to "Erkennen" tab (Recognition)
2. Show your trained gesture to the camera
3. The app should:
   - ✅ Recognize it (within 1-2 seconds)
   - ✅ Speak the gesture name
   - ✅ Show confidence score

**First time accuracy**: ~60-70%  
**After 10+ samples**: ~85-95%

---

## 🔍 Checking It Works

### Test 1: Server is Running
```bash
curl http://localhost:5000/model-version \
  -H "Authorization: Bearer demo-token"
```

**Expected**: JSON with version and path

### Test 2: Upload Works
Check server logs - you should see:
```
POST /api/v1/dgs/sample-bundles 200
```

Check `server/data/uploads/` - folders created for your profile

### Test 3: Training Works
```bash
cd server
python3 src/amyserver_tools/train_mlp.py
```

**Expected**: JSON report with your gesture labels

### Test 4: Model Download Works
In app, check console logs for:
```
[dgsModelClient] Downloaded model for profile: <your-id>
```

---

## 🐛 Troubleshooting

### App can't connect to server
**Symptoms**: "Network request failed" in app

**Fix**:
```bash
# 1. Check server is running
curl http://localhost:5000/model-version

# 2. For Android emulator, use 10.0.2.2 not localhost
export EXPO_PUBLIC_API_URL=http://10.0.2.2:5000

# 3. For physical device, use adb reverse
./scripts/adb-reverse.sh 5000
```

### Gestures not uploading
**Symptoms**: No files in `server/data/uploads/`

**Fix**:
1. Check WiFi is enabled (cellular won't work)
2. Verify token: `EXPO_PUBLIC_API_TOKEN=demo-token`
3. Check app logs for upload errors
4. Try recording another sample

### Low recognition accuracy
**Symptoms**: Confidence < 50%

**Fix**:
1. Record 10+ samples per gesture (not just 5)
2. Use consistent lighting
3. Keep hand in frame and steady
4. Vary angle slightly but keep gesture consistent
5. Wait 30 seconds after upload for model to retrain

### Server errors
**Symptoms**: 500 errors in server logs

**Fix**:
```bash
# 1. Check Python dependencies
pip install -r server/requirements.txt

# 2. Check data directory exists
mkdir -p server/data/models/global

# 3. Check training manifest exists
echo '{"version":"1.0","entries":[]}' > server/data/datasets/training_manifest.json

# 4. Restart server
cd server
npm run build
npm start
```

---

## 📊 Understanding the System

### What Happens When You Record a Gesture?

```
Your Hand → Camera → MediaPipe → 42 Landmarks × 3D Coords
                                         ↓
                                  126 numbers
                                         ↓
                              Neural Network (MLP)
                                         ↓
                              "THUMBS_UP" (85% confidence)
```

### Where Is Data Stored?

**App (Mobile Device):**
- Training samples: `AsyncStorage` (queued)
- Cached models: `FileSystem` (~500 KB)

**Server:**
```
data/
├── uploads/
│   └── your-profile/
│       └── 1234567890/
│           ├── bundle.zip
│           ├── metadata.json
│           ├── landmarks.json
│           └── clip.mp4
├── models/
│   ├── global/
│   │   └── amy_model.npz    # Shared baseline
│   └── your-profile/
│       └── amy_model.npz    # Your personal model
└── datasets/
    └── training_manifest.json
```

### How Does Training Work?

1. **Collect samples**: Your 5-10 gesture recordings
2. **Extract features**: 126 numbers per frame (hand landmarks)
3. **Average frames**: Weighted mean (still frames prioritized)
4. **Train network**: 126 inputs → 256 hidden neurons → N gestures
5. **Save weights**: `.npz` file with trained parameters
6. **Serve model**: App downloads and caches

**Training time**: 5-30 seconds depending on sample count

---

## 🎯 Next Steps

### Add More Gestures
1. Go to Training screen
2. Pick another gesture
3. Record 5-10 samples
4. Wait for training
5. Test in Recognition screen

**Recommended gestures:**
- Basic: 👍 👎 👋 ✌️ ✊
- Advanced: 👌 🤘 🤙 🖖 🫰

### Improve Accuracy
- Record 10+ samples per gesture
- Vary lighting conditions
- Different backgrounds
- Both hands (if you use both)
- Different times of day

### Share With Others
Your trained model is personal to your profile. To help others:
1. They create their own profile
2. They record their own gestures
3. System trains their personal model
4. Everyone gets personalized recognition

**Global baseline**: After many users contribute, the global model improves for everyone!

---

## 📚 Learn More

- **Technical Details**: See `docs/CORE_GESTURE_RECOGNITION.md`
- **API Reference**: See Quick Start guide
- **Architecture**: See Implementation Summary
- **Advanced Setup**: See BUILD_AND_TEST.md

---

## ✨ You Did It!

You now have a working gesture recognition system that:
- ✅ Learns YOUR gestures
- ✅ Trains personal AI models
- ✅ Recognizes gestures in real-time
- ✅ Improves with more samples

**Time spent**: ~10-15 minutes  
**What you learned**: ML model training, real-time recognition, personalization

**Next challenge**: Train 10 different gestures and achieve >90% accuracy! 🎯
