# Gesture Recognition Implementation Guide

This document summarizes the current on-device gesture recognition pipeline used in Amy's Echo. It can be used by future developers or LLM agents as a starting point for production-ready gesture recognition.

## 1. Model Assets

Pre-trained models are bundled with the app under `assets/models/`:

- `hand_landmarker.tflite` – detects hand keypoints
- `gesture_classifier.tflite` – classifies gestures from keypoints
- `gesture_labels.json` – array mapping model outputs to gesture IDs

Paths to these assets are exposed in `app/src/constants/modelPaths.ts`:

```typescript
export const HAND_LANDMARKER_MODEL = Asset.fromModule(require('../../assets/models/hand_landmarker.tflite')).uri;
export const GESTURE_CLASSIFIER_MODEL = Asset.fromModule(require('../../assets/models/gesture_classifier.tflite')).uri;
```

## 2. Loading Models

Models are loaded once when the app starts inside `AppServicesProvider`:

```typescript
const gestureLabels = require('../../assets/models/gesture_labels.json');

useEffect(() => {
  async function initializeServices() {
    const landmarkAsset = Asset.fromModule(HAND_LANDMARKER_MODEL);
    await landmarkAsset.downloadAsync();
    const gestureAsset = Asset.fromModule(GESTURE_CLASSIFIER_MODEL);
    await gestureAsset.downloadAsync();

    let customGestureModelUri = await loadCustomModelUri();
    const gestureModelSource = customGestureModelUri ? { url: customGestureModelUri } : { url: gestureAsset.localUri };

    await mlService.loadModels(
      { url: landmarkAsset.localUri! },
      gestureModelSource,
      gestureLabels,
    );
    setAreServicesReady(true);
  }
  initializeServices();
}, []);
```

`mlService.loadModels` accepts the landmark model, the gesture classifier (either the bundled or personalized model), and the label array.

## 3. Frame Processing

Screens that perform recognition use the `useGestureClassifier` hook from `app/src/services/mlService.ts`. This hook returns a memoized frame processor worklet that extracts landmarks and classifies them, invoking the provided callback with results. An optional third parameter lets you react to processing errors.

Example from `RecognitionScreen.tsx`:

```typescript
const [processingError, setProcessingError] = useState<string | null>(null);

const onGestureResult = useCallback(async (result: any) => {
  if (isProcessing) return;

  if (result && result.label && result.label !== 'uncertain' && result.confidence > 0.7) {
    // ... handle recognized gesture ...
  } else if (result && result.label === 'uncertain') {
    setStatus("I didn't understand. Please try again.");
  }
}, [isProcessing, useDgs, profile, startFeedbackAnimation]);

const handleError = (msg: string) => {
  logger.warn('Frame processor error:', msg);
  setProcessingError(msg);
};

const frameProcessor = useGestureClassifier(onGestureResult, isProcessing, 0.7, handleError);
```

Attach the frame processor to the camera component:

```tsx
<Camera
  style={styles.camera}
  device={device}
  isActive={true}
  frameProcessor={frameProcessor}
  frameProcessorFps={5}
/>
```

Use the `ErrorMessage` component to surface processing issues to the user:

```tsx
<ErrorMessage message={processingError} />
```

## 4. Confidence Calibration

### Adaptive Threshold Lookup

After each classification, the service looks up a gesture-specific confidence
threshold. Thresholds are stored in WatermelonDB and scoped per profile. To
avoid repeated queries, results are cached briefly in-memory. If a custom value
is unavailable, the service falls back to a global default.

### Softmax Temperature Scaling

Local inference applies a configurable softmax temperature before computing the
final probabilities. Lower temperatures sharpen predictions while higher
temperatures produce a softer distribution. The value is supplied at startup and
clamped to avoid invalid inputs.

## 5. Remote Classification & Offline Fallback

`mlService` optimistically attempts a cloud lookup. Each request is wrapped in
an `AbortController` whose `signal` is passed to `fetch`. A timer based on
`REMOTE_TIMEOUT_MS` (400 ms by default) aborts the call if the server does not
respond in time. Non-OK responses or aborts trip a short circuit breaker to
avoid rapid retries. Whenever the remote path fails, `mlService` reuses the
local predictions so the user still receives a result even when offline.

## 6. Profile ID Propagation

The active profile is set when a user begins a session and is passed to
`mlService.setProfileId`. The service caches the value so both paths remain
profile-aware:

- **Local path** – adaptive threshold lookups query WatermelonDB using the
  current profile ID.
- **Remote path** – the profile ID is included in the JSON payload sent to the
  server, keeping analytics and model personalization scoped to the correct
  child.

## 7. Data Collection and Training

Caregivers can record samples on `TrainingScreen.tsx`. Landmarks are extracted from recorded videos and stored in WatermelonDB. When the device syncs, these samples are uploaded to the server, where `server/src/train.py` trains a personalized model:

```python
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(SEQUENCE_LENGTH, NUM_FEATURES)),
    tf.keras.layers.LSTM(32, return_sequences=True),
    tf.keras.layers.LSTM(32),
    tf.keras.layers.Dense(16, activation='relu'),
    tf.keras.layers.Dropout(0.5),
    tf.keras.layers.Dense(num_classes, activation='softmax'),
])
```

The server converts the trained model to `.tflite` and makes it available via the `/latest-model` endpoint. The app downloads this file and `loadCustomModelUri` returns its path for future sessions.

## 8. Implementation Plan for On‑Device Recognition

To support reliable use in classrooms and other network‑constrained spaces, the
following roadmap adds a robust local pipeline:

1. **Gesture Classifier Module** – create `app/src/ml/gestureClassifier.ts` to
   convert landmarks into gesture labels and confidence scores.
2. **TensorFlow Hook Integration** – expose the classifier through
   `useTensorflowModel.ts` so screens can call `classifyGesture` after landmark
   extraction.
3. **Hybrid Recognition Flow** – update `RecognitionScreen.tsx` to perform
   local classification first and fall back to the cloud when confidence drops
   below a threshold.
4. **Confidence‑Based UI** – display status messages and a confidence bar,
   triggering correction flows when uncertainty is high.
5. **Model Update Service** – add `modelUpdateService.ts` to download newer
   `.tflite` models and swap them in at startup.
6. **Testing & Device Protocols** – add unit/integration tests for the classifier
   and document manual device testing in `docs/GestureRecognitionTesting.md`.

---

This guide reflects the current codebase and can serve as a blueprint for further improvements or reimplementation.
