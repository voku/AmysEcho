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

Screens that perform recognition obtain a worklet from `mlService.classifyGesture`. The worklet extracts landmarks and classifies them, invoking the provided callback with results.

Example from `LearningScreen.tsx`:

```typescript
const frameProcessor = mlService.classifyGesture((result) => {
  if (result && result.confidence > 0.85 && result.label !== lastGesture) {
    const recognizedSymbolLabel = getSymbolLabelForGesture(result.label);
    const foundSymbol = vocabulary.find((s) => s.name === recognizedSymbolLabel);
    if (foundSymbol) {
      handlePress(foundSymbol);
      setLastGesture(result.label);
      setTimeout(() => setLastGesture(null), 2000);
    }
  }
});
```

`RecognitionScreen.tsx` uses the same worklet to show feedback and play audio:

```typescript
const frameProcessor = mlService.classifyGesture(async (result) => {
  if (isProcessing) return;
  if (result && result.label && result.label !== 'uncertain' && result.confidence > 0.7) {
    // ... handle recognized gesture ...
  } else if (result && result.label === 'uncertain') {
    setStatus("I didn't understand. Please try again.");
  }
});
```

Attach the worklet to the camera component:

```tsx
<Camera
  style={styles.camera}
  device={device}
  isActive={true}
  frameProcessor={frameProcessor}
  frameProcessorFps={5}
/>
```

## 4. Offline Fallback Logic

`mlService` first attempts remote classification with a short timeout. If that fails, it falls back to the local model:

```typescript
result = await Promise.race([
  this.classifyRemotely(processed),
  new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Remote timeout')), this.remoteTimeout)),
]);

if (!result) {
  const tensor = this.prepareTensorInput(processed);
  const output = this.gestureModel.runSync([tensor]) as any[];
  const { gesture, confidence } = this.processModelOutput(output[0] as number[]);
  result = { label: gesture, confidence, isLocal: true, timestamp: Date.now(), suggestions: [], requiresConfirmation: confidence < this.confidenceThreshold };
}
```

This ensures quick responsiveness even without connectivity.

## 5. Data Collection and Training

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
