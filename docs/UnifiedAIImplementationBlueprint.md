# Amy's Echo: Unified AI Implementation Blueprint

**Document Purpose**: This document outlines the official, simplified architecture for gesture recognition in the Amy's Echo application, designed for Expo compatibility.

For a list of alternative approaches and the current implementation status, refer to [`docs/ExpoGestureRecognition.md`](docs/ExpoGestureRecognition.md).

**Executive Summary**: To ensure stability and performance within the Expo ecosystem, we have adopted a **WebView-based, on-device** gesture recognition strategy using MediaPipe Tasks JS loaded from a CDN.

1.  **Landmarks + Classification (On-Device)**: A `WebView` component renders a web page with MediaPipe Tasks Vision. It performs hand landmark detection and gesture classification fully on-device.
2.  **Heuristic Assist**: A simple, rule-based classifier in the WebView augments recognition for ambiguous cases.

---

## **Part I: The WebView-Based Recognition Pipeline**

**Objective**: To build a reliable and performant gesture recognition system that works seamlessly with Expo's development client.

### **Section 1: The `MediaPipeGestureDetector` Component**

*   **File**: `app/src/components/MediaPipeGestureDetector.tsx`
*   **Core Technology**:
    *   `react-native-webview`: To host the MediaPipe web application.
    *   `@mediapipe/hands`: The JavaScript library for hand tracking.
*   **Functionality**:
    *   The component renders an HTML page with the necessary JavaScript to access the device's camera and run the MediaPipe hand tracking model.
*   When hands are detected, the component extracts 21 landmarks per hand (supports two hands).
    *   It then uses `window.ReactNativeWebView.postMessage` to send the landmark data back to the React Native application.

### **Section 2: Integration with `RecognitionScreen.tsx`**

*   **File**: `app/src/screens/RecognitionScreen.tsx`
*   **Logic**:
    *   The screen renders the `MediaPipeGestureDetector` component.
    *   It listens for messages from the WebView using the `onMessage` prop.
    *   The `handleGestureDetected` callback receives the landmarks and gesture information.
    *   It then triggers the appropriate user feedback (audio, visual) and handles the correction flow if necessary.

---

## **Part II: CDN Assets and Model**

**Objective**: Use stable, public CDNs for the runtime and model.

### **Section 3: MediaPipe Tasks JS**

*   Runtime: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js`
*   WASM path: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm`
*   Model: `https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`

---

**Document End.**
This blueprint provides a high-level overview of the current gesture recognition architecture. For detailed implementation code and alternative solutions, see `docs/ExpoGestureRecognition.md`.
