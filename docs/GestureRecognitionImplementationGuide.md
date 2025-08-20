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

`mlService` optimistically attempts a cloud lookup. A request is issued with an
`AbortController`, so the fetch is cancelled if the timeout elapses. Failed
requests trigger a circuit breaker to prevent rapid retries. When the remote
path fails or times out, the service seamlessly falls back to the on-device
model for a response.

## 6. Profile ID Propagation

The active profile is set when a user begins a session. `mlService` stores this
ID so both paths remain profile-aware:

- **Local path** – the profile ID scopes adaptive threshold queries, ensuring
  personalization of confirmation requirements.
- **Remote path** – the profile ID is included in the classification payload so
  server-side models and analytics stay tied to the correct child.

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

---

This guide reflects the current codebase and can serve as a blueprint for further improvements or reimplementation.
