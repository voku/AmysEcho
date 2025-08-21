# Amy's Echo - Updated TODO List

## Current Status Summary
The gesture recognition pipeline has been refactored to use a `WebView` running MediaPipe for hand landmark detection. The landmarks are then sent to a server-side endpoint for classification. This provides a reliable, cross-platform solution that works well with Expo's development client.

> The new implementation guide is available at: [`docs/ExpoGestureRecognition.md`](docs/ExpoGestureRecognition.md)

## Recognition Architecture: WebView + Remote Classification
_Last updated: 2025-08-21_

- **Primary Recognition**: A `WebView` running MediaPipe extracts hand landmarks on the client.
- **Classification**: The landmarks are sent to a remote server for classification.
- **Offline Fallback**: A simple, rule-based classifier is included in the WebView's JavaScript for offline scenarios.

---

## 🔑 High-Priority Task: Stabilize and Enhance the WebView Solution

1.  **[x] Implement `MediaPipeGestureDetector.tsx`**
    - A new component that encapsulates the `WebView` and MediaPipe logic.

2.  **[x] Integrate into `RecognitionScreen.tsx`**
    - The main recognition screen now uses the new component.

3.  **[x] Re-introduce User Feedback and State Management**
    - The `RecognitionScreen` has been updated to include status messages, feedback animations, and the correction flow.

4.  **[x] Implement Server-Side Classification**
    - A new endpoint on the server (`/api/classify-landmarks`) accepts an array of landmarks and returns a gesture classification.

5.  **[x] Enhance the In-WebView Classifier**
    - Added rule-based fallback inside the WebView HTML (thumbs_up, point, open_palm, fist) used when Tasks Vision confidence is low.
    - Keep iterating as we add Amy-specific gestures.

6.  **[x] Update Documentation**
    - **[x] `docs/ExpoGestureRecognition.md`** has been created and updated.
    - **[x] `README.md`** has been updated.
    - **[x] `spec/AmysEcho.md`** has been reviewed and updated.
    - **[x] `docs/UnifiedAIImplementationBlueprint.md`** has been updated.
    - **[x] `docs/GestureRecognitionImplementationGuide.md`** has been removed.

---

## 🚀 Production Readiness

- [ ] **Store Preparation**: Finalize EAS Build config, screenshots, etc.
- [ ] **Data Management**: Implement backup/restore and GDPR features.
- [ ] **User Documentation**: Create caregiver guides and tutorials.

## Backend + Hosting Tasks

- [x] Serve gesture_recognizer.task at `/static/models/gesture_recognizer.task`.
- [x] Proxy/cache MediaPipe Tasks Vision assets at `/static/mediapipe/tasks-vision/<version>/...`.
- [x] Prewarm `vision_bundle.mjs` and a common WASM file on server start.
- [x] Prewarm all WASM variants by parsing the bundle or logging first-hit filenames.

## Telemetry & Observability

- [x] Send recognizer init time from WebView to `/telemetry`.
 - [x] Add telemetry for server fallback usage + periodic per-frame processing latency.

## Cleanup & Consistency

- [x] Remove runtime dependence on `.tflite` and mlService in app.
- [x] Migrate TrainingScreen to use WebView landmarks.
- [x] Remove or rehome legacy TFLite-only modules (useTensorflowModel, landmarkExtractor, gestureClassifier) and update tests accordingly
      so TS excludes can be dropped entirely.

## Gesture & Workflow Enhancements

- [ ] Enable training of new gestures in `TrainingScreen` so they are available in `RecognitionScreen`.
  - Persist labeled samples locally and sync them to the server.
  - Refresh the gesture library after training completes.
- [x] Play the spoken name of a recognized gesture (e.g., "Papa").
  - Use `expo-speech` with a pre-recorded audio fallback.
- [ ] Support DGS gestures that require both hands.
  - Capture and classify dual-hand landmarks in the WebView and server pipeline.

---

*Last Updated: 2025-08-21*
*Project Goal: Turn Amy's gestures into understanding. Every time.*
