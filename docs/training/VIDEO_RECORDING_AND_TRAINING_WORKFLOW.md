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

**UX Notes**:
- The Training recorder now mirrors the recognition screen with a full-screen camera view. Primary recording controls live below the preview, while detailed recording stats and still-frame tools sit in a separate details panel underneath.
- Advanced diagnostics (landmark stream + detector status) are tucked into a collapsible “Technische Details” section to keep the main flow focused.
- Caregivers can toggle between raw video and a skeleton-only preview; the hand/pose/face overlay stays visible in both modes for privacy-safe checks.

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
- During ingestion into `data/dgs_samples.json`, the server applies a quality gate before frames are promoted from `training_manifest.json`:
  - **Minimum frames per sign**: `MIN_SIGN_SAMPLE_FRAMES = 8`
  - **Required hand coverage**: `MIN_HAND_FRAME_COVERAGE = 0.7`
  - **Jitter thresholds (average per-frame delta)**:
    - Hands: `MAX_HAND_JITTER = 0.2`
    - Pose: `MAX_POSE_JITTER = 0.3`
    - Face: `MAX_FACE_JITTER = 0.12`
  - Bundles that fail are skipped and logged with reasons. Thresholds live in `server/src/constants/trainingQuality.ts`.
- Returns: Bundle ID and training job status

## Non-Manual Feature Contract (`landmarks.json`)

`nonManual` ist kein Platzhalter-Feld, sondern ein expliziter Teil des multimodalen Trainingsvertrags zwischen Webapp und Server.

### Was die Webapp liefert
Beim Bundle-Bau berechnet die Webapp pro Frame aus Pose-/Face-Landmarks zusätzliche nicht-manuelle Merkmale (`nonManualFeatures`), aktuell:
- `headYaw`
- `headPitch`
- `mouthOpenness`
- `eyebrowRaiseLeft`
- `eyebrowRaiseRight`
- `source` (`face` | `pose` | `mixed`)

Wenn diese Werte vorhanden sind, werden sie im jeweiligen Frame von `landmarks.json` gespeichert.

Zusätzlich schreibt die Webapp in `metadata.modalities.nonManual`:
- `present`
- `frameCount`
- `coverage`

Diese Felder beschreiben, in wie vielen Frames nicht-manuelle Features enthalten sind.

### Was der Server erwartet und wie er damit umgeht
- Der Server akzeptiert `landmarks.json` weiterhin, wenn `nonManualFeatures` fehlen (degradierter Modus bleibt möglich).
- Wenn `nonManualFeatures` vorhanden sind, werden sie in der Modalitätszusammenfassung (`metadata.modalities.nonManual`) berücksichtigt.
- `nonManualFeatures` wird serverseitig als Vertrag validiert (`headYaw`, `headPitch`, `mouthOpenness`, `eyebrowRaiseLeft`, `eyebrowRaiseRight`, optional `source`). Ungültige Typen führen zu HTTP 400 (`landmarks.json missing or invalid`).
- Ingestion-Metriken zählen fehlende `nonManual`-Signale als Beobachtung, damit Qualitätsanalysen die reale multimodale Abdeckung widerspiegeln.

### Warum dieser Vertrag wichtig ist
Nicht-manuelle Signale tragen zur Bedeutung vieler Gebärden bei (z. B. Frageform, Betonung, Mimik). Für Amy bedeutet das:
- bessere Trainingsdiagnostik,
- konsistentere Datenqualität über Client/Server hinweg,
- weniger stille Datenverluste in der Pipeline.


**Bundle Format**:
```json
{
  "metadata.json": {
    "profileId": "profile_123",
    "label": "HILFE",
    "capturedAt": "2024-05-28T12:03:11Z",
    "source": "web://mediapipe",
    "clipFilename": "clip.mp4", // optional when degraded
    "audioFilename": "audio.webm", // optional, multimodal speech track
    "recording": {
      "frameCount": 48,
      "usableFrameCount": 45,
      "clipDurationMs": 1600,
      "clipBytes": 2048576,
      "clipMimeType": "video/webm",
      "stillBytes": 120341,
      "stillMimeType": "image/jpeg",
      "audioDurationMs": 1400,
      "audioBytes": 98304,
      "audioMimeType": "audio/webm"
    }
  },
  "landmarks.json": {
    "frames": [
      {
        "handLandmarks": [[/* left hand */], [/* right hand */]],
        "landmarks": [/* flattened hands */],
        "poseLandmarks": [/* optional body keypoints */],
        "faceLandmarks": [/* optional face mesh keypoints */],
        "timestampMs": 1716897791000
      }
    ]
  },
  "clip.mp4": /* video binary */,
  "audio.webm": /* audio binary */
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
2. **Overlay-Vorschau prüfen (Hände/Pose/Gesicht)** – Während die Kamera läuft sicherstellen, dass alle drei Overlays sichtbar sind und stabil auf dem Live-Bild liegen (Handpunkte, Körper-Skelett, Gesichtspunkte).
3. **Hinweistexte bei fehlenden Modalitäten prüfen** – Eine Modalität gezielt aus dem Bild nehmen (z. B. Hände aus dem Frame), dann prüfen, dass die UI die erwarteten Hinweise anzeigt (siehe Liste unten).
4. **Bundle-Upload beobachten** – Sicherstellen, dass der Upload eine `queued`-Antwort erhält.
5. **Bundle-Dateien prüfen** – Im Verzeichnis `data/uploads/<profil>/` sicherstellen, dass `bundle.zip` und extrahierte Assets vorliegen.
6. **Videoclip abspielen** – Den abgelegten Clip (`*.mp4`/`*.webm`) lokal öffnen und prüfen, dass die Aufnahme vollständig ist.
7. **Landmarks-Datei validieren** – `landmarks.json` öffnen, JSON parse (mindestens ein Frame vorhanden) und bestätigen, dass die Daten mit den Logs übereinstimmen.
8. **Manifest-Datei inspizieren** – `data/datasets/training_manifest.json` kontrollieren: neuer Eintrag mit korrekten Dateipfaden und aktualisiertem `metadata.validationSummary`.
9. **Qualitäts-Gate prüfen** – In den Server-Logs sicherstellen, dass keine Warnungen wie `Training bundle rejected by quality gate` erscheinen, oder die Gründe nachvollziehen (Frame-Anzahl, Hand-Coverage, Jitter).
10. **Profil-Zuordnung bestätigen** – In `data/dgs_samples.json` prüfen, dass jede neue Probe `profileId` gesetzt hat und der `validationSummary.landmarksPath` auf die tatsächlich trainierte Datei zeigt.
11. **Modell-Download prüfen** – Nach erfolgreichem Training `GET /latest-mlp-model?profileId=<profil>` aufrufen und sicherstellen, dass das Modell heruntergeladen wird.

### Multimodale QA
- **Hände sind Pflicht, Gesicht optional**: Fehlende Hand-Landmarks werden als Warnung protokolliert. Gesicht und Pose bleiben optional, weil manche Gebärden keinen Bezug zum Gesicht haben.
- **Smoothing beibehalten**: Die im Webapp-Smoothing verwendete Konfiguration bleibt in `metadata.smoothing` enthalten. Sie dient aktuell nur als Dokumentation und wird vom Trainingsskript nicht ausgewertet.
- **Aufnahme-Metadaten & Zeitstempel**: `metadata.recording` (Frame-Zahlen, Clip-Dauer/-Größe, MIME-Typen) bleibt im Manifest erhalten. Frame-Zeitstempel (`timestampMs`) werden beim Ingest als `ts` in `dgs_samples.json` verwendet.

### Multimodale Overlay-Prüfung (mit Screenshots)
1. **Training-Seite öffnen** – `/training` laden und sicherstellen, dass Kamera + Overlay laufen.
2. **Overlay-Screenshot aufnehmen** – Screenshot mit sichtbaren Hand-, Pose- und Gesichts-Landmarks speichern (z. B. `docs/screenshots/training-overlay-all-modalities.png`).
3. **Modalitäten einzeln ausblenden** – Hände, Oberkörper oder Gesicht aus dem Bild nehmen und prüfen, dass die UI die korrekten Hinweise zeigt.
4. **Hinweis-Screenshots aufnehmen** – Je ein Screenshot für:
   - fehlende Hände (`docs/screenshots/training-overlay-missing-hands.png`)
   - fehlende Pose (`docs/screenshots/training-overlay-missing-pose.png`)
   - fehlendes Gesicht (`docs/screenshots/training-overlay-missing-face.png`)
5. **Overlay vs. Rohvideo** – Rohvideo ausblenden, Overlay aktiv lassen, prüfen dass Landmark-Punkte weiterhin sichtbar sind.

### End-to-End-Check (Preview → Upload → Training → Download)
1. **Preview prüfen** – Im Training-Recorder kurz aufnehmen, Overlay-Sichtbarkeit bestätigen.
2. **Upload starten** – Aufnahme verwenden und Upload auslösen (Status `queued`).
3. **Training triggern** – `/train-model` starten (manuell oder automatisch), bis Status `completed`.
4. **Modell laden** – `GET /latest-mlp-model?profileId=<profil>` abrufen, sicherstellen, dass ein neuer Download erfolgt.
5. **Ergebnis prüfen** – Im Recorder prüfen, ob die neue Modellversion geladen wird und die Erkennung stabil bleibt.

### Erwartete UI-Hinweise (Deutsch)
Die folgenden Hinweise müssen erscheinen, wenn die jeweilige Modalität fehlt:
- **Hände fehlen:** `Bitte halte beide Hände sichtbar im Kamerabild.`
- **Pose fehlt:** `Bitte halte deinen Oberkörper im Bild, damit Pose-Landmarks erkannt werden.`
- **Gesicht fehlt:** `Bitte halte dein Gesicht im Bild, damit Gesichts-Landmarks erkannt werden.`


---

### 4. ✅ Model Training

**Status**: ✅ **FULLY IMPLEMENTED**

**Implementation Details**:
- **Technology**: Python with NumPy, MediaPipe, OpenCV
- **Location**: `server/src/amyserver_tools/train_mlp.py`
- **Features**:
  - Loads training bundles from manifest
  - Extracts landmarks from videos using MediaPipe (if needed)
  - Bundle landmark source policy: `MLP_BUNDLE_LANDMARK_POLICY` (`bundle_only` default, optional `prefer_bundle` / `prefer_server_extract`) to control whether server fallback extraction from clip is allowed for uploaded bundles
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
