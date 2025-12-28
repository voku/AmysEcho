# Video Recording and Training Workflow - Implementation Status

## ✅ All Features Fully Implemented

This document summarizes the current implementation status for video recording, training, and gesture recognition features.

---

## Complete Feature Implementation

### 1. ✅ Video Recording (Web MediaRecorder API)

**Status**: ✅ **FULLY IMPLEMENTED**

**Implementation Details**:
- **Technology**: MediaRecorder API in the browser (with fallback frame capture)
- **Location**: `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`
- **Features**:
  - Start/stop/cancel video recording
  - Multiple codec fallback support (video/webm, video/mp4, etc.)
  - Automatic quality adjustment
  - Error handling with graceful fallback
  - MIME type detection and support checking
  - Prefer `navigator.userAgentData` (when available) to avoid relying solely on user-agent strings for default MIME selection

**Browser Dependencies**: Uses standard Web APIs (`MediaRecorder`, `getUserMedia`), so no Expo packages are required.

**Code References**:
- Recorder orchestration: `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`
- Fallback clip recorder: `webapp/src/gesture/utils/FallbackClipRecorder.ts`
- Used in components:
  - `webapp/src/components/TrainingRecorder.tsx`
  - `webapp/src/components/SignLanguageRecorder.tsx`

**Key Methods**:
```typescript
interface MediaPipeGestureDetectorHandle {
  startClipCapture: () => Promise<string>;
  stopClipCapture: () => Promise<ClipReadyPayload>;
  cancelClipCapture: () => void;
}
```

---

### 2. ✅ Video Persistence

**Status**: ✅ **FULLY IMPLEMENTED**

**Implementation Details**:
- **Technology**: IndexedDB with optional OPFS for large bundles
- **Location**: `webapp/src/training/trainingQueue.ts`
- **Features**:
  - Persists ZIP bundles (including optional clips) for offline retry
  - Stores metadata and bytes separately for fast listing
  - Cleans up failed or uploaded bundles

**Code References**:
- Queue persistence: `webapp/src/training/trainingQueue.ts`
- Used in training: `webapp/src/hooks/useTrainingUploader.ts`

---

### 3. ✅ Video Upload (Bundle Creation & Upload)

**Status**: ✅ **FULLY IMPLEMENTED**

**Implementation Details**:
- **Technology**: ZIP bundle creation using fflate, multipart upload
- **Location**: `webapp/src/training/trainingBundle.ts`
- **Features**:
  - Creates ZIP bundles with:
    - `metadata.json` (profile, label, timestamps, recording stats)
    - `landmarks.json` (hand + optional pose/face landmarks including non-manual marker features)
    - `still.jpg` (privacy-safe reference frame)
    - `clip.*` (video recording, optional when the camera pipeline fails)
  - Uploads to `/api/v1/dgs/sample-bundles`
  - Queue management with IndexedDB/OPFS
  - Automatic retry on failure
  - **Degraded mode**: if no clip is available the webapp still uploads the metadata + landmark bundle so caregivers do not lose their samples.

**Code References**:
- Bundle creation: `webapp/src/training/trainingBundle.ts`
- Upload queue: `webapp/src/training/trainingQueue.ts`
- Upload orchestration: `webapp/src/hooks/useTrainingUploader.ts`

**Server Endpoint**:
- Route: `server/src/routes/trainingBundleRoute.ts`
- Endpoint: `POST /api/v1/dgs/sample-bundles`
- Accepts: ZIP bundles up to 64MB
- Validates that `landmarks.json` exists, parses it, requires at least one frame, and records a `validationSummary` (frame count + file path) inside `manifestEntry.metadata`. Invalid bundles are rejected with HTTP 400 and the partially extracted directory is removed to avoid orphaned files.
- Returns: Bundle ID and training job status

**Bundle Format**:
```json
{
  "metadata.json": {
    "profileId": "profile_123",
    "label": "HILFE",
    "capturedAt": "2024-05-28T12:03:11Z",
    "source": "web://mediapipe",
    "clipFilename": "clip.mp4", // optional when degraded
    "recording": {
      "frameCount": 48,
      "usableFrameCount": 45,
      "clipDurationMs": 1600,
      "clipBytes": 2048576,
      "clipMimeType": "video/webm",
      "stillBytes": 120341,
      "stillMimeType": "image/jpeg"
    }
  },
  "landmarks.json": {
    "frames": [
      {
        "handLandmarks": [[/* left hand */], [/* right hand */]],
        "landmarks": [/* flattened hands for backward-compat */],
        "poseLandmarks": [/* optional body keypoints */],
        "faceLandmarks": [/* optional face mesh keypoints */],
        "timestampMs": 1716897791000
      }
    ]
  },
  "clip.mp4": /* video binary */
}
```

> Wenn kein Clip gespeichert wurde, enthält das ZIP nur `metadata.json`, `landmarks.json` und ggf. `still.jpg`. Die Serverroute akzeptiert dieses degradierte Paket weiterhin und kennzeichnet es lediglich ohne `clipFilename` im Manifest. Wichtig: `landmarks.json` ist Pflicht – fehlt die Datei oder enthält sie keine Frames, antwortet der Server mit HTTP 400.

**Profilzuordnung auf mehreren Geräten**:
- Die aktive Profil-ID wird aus dem Webapp-Profilregister (`webapp/src/services/profileRegistry.ts`) gelesen und in jedem Bundle gespeichert.
- `enqueuePersistedBundle` (`webapp/src/training/trainingQueue.ts`) speichert die `profileId` im Bundle-Metadatenobjekt sowie im Schlüssel (`trainingBundles:<profileId>:...`). Dadurch bleibt die Zuordnung erhalten, selbst wenn Amy später zu einem anderen Profil wechselt.
- Der Upload-Prozess (`webapp/src/hooks/useTrainingUploader.ts`) nutzt ausschließlich die im Bundle gespeicherte `profileId`, sodass Samples immer dem ursprünglichen Kind zugeordnet bleiben.

## QA-Checkliste

### Manuelle Prüfungen
1. **Gestenaufnahme starten** – In der Webapp auf der Trainingsseite eine Geste aufzeichnen und bestätigen.
2. **Bundle-Upload beobachten** – Sicherstellen, dass der Upload eine `queued`-Antwort erhält.
3. **Bundle-Dateien prüfen** – Im Verzeichnis `data/uploads/<profil>/` sicherstellen, dass `bundle.zip` und extrahierte Assets vorliegen.
4. **Videoclip abspielen** – Den abgelegten Clip (`*.mp4`/`*.webm`) lokal öffnen und prüfen, dass die Aufnahme vollständig ist.
5. **Landmarks-Datei validieren** – `landmarks.json` öffnen, JSON parse (mindestens ein Frame vorhanden) und bestätigen, dass die Daten mit den Logs übereinstimmen.
6. **Manifest-Datei inspizieren** – `data/datasets/training_manifest.json` kontrollieren: neuer Eintrag mit korrekten Dateipfaden und aktualisiertem `metadata.validationSummary`.
7. **Profil-Zuordnung bestätigen** – In `data/dgs_samples.json` prüfen, dass jede neue Probe `profileId` gesetzt hat und der `validationSummary.landmarksPath` auf die tatsächlich trainierte Datei zeigt.

### Multimodale QA
- **Hände sind Pflicht, Gesicht optional**: Fehlende Hand-Landmarks werden als Warnung protokolliert. Gesicht und Pose bleiben optional, weil manche Gebärden keinen Bezug zum Gesicht haben.
- **Smoothing beibehalten**: Die im Webapp-Smoothing verwendete Konfiguration bleibt in `metadata.smoothing` enthalten. Sie dient aktuell nur als Dokumentation und wird vom Trainingsskript nicht ausgewertet.
- **Aufnahme-Metadaten & Zeitstempel**: `metadata.recording` (Frame-Zahlen, Clip-Dauer/-Größe, MIME-Typen) bleibt im Manifest erhalten. Frame-Zeitstempel (`timestampMs`) werden beim Ingest als `ts` in `dgs_samples.json` verwendet.

---

### 4. ✅ Model Training

**Status**: ✅ **FULLY IMPLEMENTED**

**Implementation Details**:
- **Technology**: Python with NumPy, MediaPipe, OpenCV
- **Location**: `server/src/amyserver_tools/train_mlp.py`
- **Features**:
  - Loads training bundles from manifest
  - Extracts landmarks from videos using MediaPipe (if needed)
  - Caches extracted landmarks
  - Trains Multi-Layer Perceptron (MLP)
  - Produces both global and per-profile models
  - Early stopping with patience
  - Structured training reports (JSON)

**Code References**:
- Training script: `server/src/amyserver_tools/train_mlp.py` (lines 1-100+)
- Auto-retrain: `server/src/tools/autoRetrain.ts`
- Training endpoint: `server/src/server.ts` (lines 670-715)

**Training Configuration** (Environment Variables):
```bash
MLP_HIDDEN_SIZE=128        # Hidden layer size
MLP_LEARNING_RATE=0.01     # Learning rate
MLP_EPOCHS=500             # Max training epochs
MLP_MAX_FRAMES=120         # Max frames per clip
MLP_FRAME_STRIDE=2         # Frame sampling stride
MLP_DROPOUT_RATE=0.0       # Dropout rate
MLP_EARLY_STOPPING_PATIENCE=50  # Early stopping patience
```

**Model Outputs**:
- Global model: `server/data/models/global/amy_model.npz`
- Per-profile models: `server/data/models/{profileId}/amy_model.npz`

**Training Trigger**:
```bash
# Manual trigger
curl -X POST http://localhost:5000/train-model \
  -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"bundles"}'

# Auto-trigger after bundle upload
# (automatically called by trainingBundleRoute)
```

---

### 5. ✅ Model Download and Usage

**Status**: ✅ **FULLY IMPLEMENTED**

**Implementation Details**:
- **Technology**: HTTP download with caching, in-app injection
- **Location**:
  - Download client: `webapp/src/gesture/modelClient.ts`
  - Model injection: `webapp/src/hooks/useMlpModelInjection.ts`
  - Server route: `server/src/routes/latestMlpModelRoute.ts`
- **Features**:
  - Downloads personalized models per profile
  - Falls back to global model
  - Uses cache-friendly HTTP responses (ETag when provided by the server)
  - Falls back to MediaPipe-only recognition when no model is available
  - Model version tracking

**Code References**:
- Client download: `webapp/src/gesture/modelClient.ts`
- Model injection hook: `webapp/src/hooks/useMlpModelInjection.ts`
- Server route: `server/src/routes/latestMlpModelRoute.ts`

**Server Endpoint**:
```typescript
// Get latest model (global or personalized)
GET /latest-mlp-model?profileId={profileId}

// Response Headers:
ETag: "sha256-{hash}"
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="amy_model.npz"
```

**Model Injection Flow**:
1. `useMlpModelInjection` detects profile change
2. `fetchMlpModelWithFallback` downloads a personalized model when available
3. Model metadata is broadcast to listeners for UI feedback
4. The recognition pipeline consumes the latest weights in memory

**Key Functions**:
```typescript
export async function fetchMlpModelWithFallback(params: {
  endpoint: string;
  token?: string;
  profileId?: string;
}): Promise<MlpModelResponse | null>
```

---

## Complete Workflow Diagram

```text
RECORDING (Webapp)
  TrainingRecorder + GestureRecognitionOrchestrator
  - MediaRecorder captures clip + still frame
  - MediaPipe extracts hand/pose/face landmarks

QUEUE (Webapp)
  trainingQueue (IndexedDB/OPFS)
  - Bundles metadata.json + landmarks.json + still.jpg + clip.*

UPLOAD (Webapp → Server)
  uploadTrainingZip → /api/v1/dgs/sample-bundles
  - Server validates and expands bundle
  - training_manifest.json updated

TRAINING (Server)
  train_mlp.py
  - Builds global + per-profile amy_model.npz

DOWNLOAD (Webapp)
  useMlpModelInjection + modelClient
  - GET /latest-mlp-model?profileId=...
  - Injects weights into recognition pipeline
```

---

## Test Coverage

Current server test coverage and pass status are tracked in:
- `docs/testing/Test_Coverage_Report_Server.md`

---

## Configuration

### Webapp Environment Variables
```bash
VITE_API_URL=http://localhost:5000  # Server URL
```

### Server Environment Variables
```bash
PORT=5000                           # Server port
MLP_DATA_DIR=./data                # Data directory
MLP_HIDDEN_SIZE=128                # MLP hidden layer size
MLP_LEARNING_RATE=0.01             # Learning rate
MLP_EPOCHS=500                     # Max epochs
MLP_EARLY_STOPPING_PATIENCE=50     # Early stopping
```

---

## File Locations

### Webapp
```text
webapp/
├── src/
│   ├── components/
│   │   ├── TrainingRecorder.tsx            # Training UI with recording
│   │   └── SignLanguageRecorder.tsx        # Real-time recognition UI
│   ├── gesture/
│   │   ├── core/
│   │   │   ├── GestureDetector.ts          # MediaPipe pipeline
│   │   │   └── GestureRecognitionOrchestrator.ts
│   │   └── modelClient.ts                  # Model download client
│   ├── hooks/
│   │   ├── useMlpModelInjection.ts         # Model injection hook
│   │   └── useTrainingRecorder.ts          # Clip + landmark capture
│   ├── training/
│   │   ├── trainingBundle.ts               # ZIP creation + upload
│   │   └── trainingQueue.ts                # Upload queue management
│   └── utils/
│       └── landmarkUtils.ts                # Landmark processing
```

### Server
```text
server/
├── src/
│   ├── routes/
│   │   ├── trainingBundleRoute.ts          # Bundle upload endpoint
│   │   └── latestMlpModelRoute.ts          # Model download endpoint
│   ├── services/
│   │   ├── trainingBundleIngestor.ts       # Bundle processing
│   │   └── mlpModelArtifacts.ts            # Model artifacts
│   ├── amyserver_tools/
│   │   ├── train_mlp.py                    # Python training script
│   │   └── generate_zero_model.py          # Baseline model generator
│   └── server.ts                           # Express server + /train-model
├── data/
│   ├── uploads/                            # Training bundles
│   ├── datasets/
│   │   └── training_manifest.json          # Bundle manifest
│   └── models/
│       ├── global/
│       │   └── amy_model.npz               # Global model
│       └── {profileId}/
│           └── amy_model.npz               # Per-profile models
└── requirements.txt                         # Python dependencies
```

`trainingBundleRoute.ts` records a `validationSummary.landmarksPath` for each upload, `trainingBundleIngestor.ts` reads exactly that verified path (and stamps the `profileId`) when appending frames to `dgs_samples.json`, and `train_mlp.py` keeps the samples separated per kid before producing global + per-profile `.npz` weights. On the download side the webapp's `modelClient.ts` always sends `profileId` plus `X-Profile-Id`, so `/latest-mlp-model` returns the personalized model when available and only falls back to the global baseline when strictly necessary.

---

## Conclusion

**Alle Kernfunktionen sind implementiert.**

Das Aufzeichnen, Bündeln, Hochladen, Trainieren und Aktualisieren der Modelle ist vollständig in der Webapp integriert. Prüfe den aktuellen Teststatus in den Test-Coverage-Berichten und führe die Test-Suites gemäß `docs/testing/TESTING_STRATEGY.md` aus, bevor du Änderungen ausrollst.
