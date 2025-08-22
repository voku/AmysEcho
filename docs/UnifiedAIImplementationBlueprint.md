# Amy's Echo: Unified AI Implementation Blueprint

**Document Purpose**: This document outlines the official, simplified architecture for gesture recognition in the Amy's Echo application, designed for Expo compatibility.

For a list of alternative approaches and the current implementation status, refer to [`docs/ExpoGestureRecognition.md`](docs/ExpoGestureRecognition.md).

**Executive Summary**: To ensure stability and performance within the Expo ecosystem, we have adopted a **WebView-based, remote-first** gesture recognition strategy.

1.  **Gesture Recognition**: A `WebView` component renders a web page with MediaPipe's JavaScript library. This library handles hand landmark detection directly in the WebView.
2.  **Classification**: The extracted landmarks are then sent to a remote server for classification, ensuring the highest possible accuracy.
3.  **Offline Fallback**: A simple, rule-based classifier is implemented in the WebView's JavaScript to provide basic gesture recognition when the device is offline.

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

## **Part II: Server-Side Classification**

**Objective**: To provide a high-accuracy classification service for the landmark data sent from the client.

### **Section 3: The Classification Endpoint**

*   **Endpoint**: `POST /api/classify-landmarks`
*   **Logic**:
*   Receives an array of hand landmarks (one or two hands, each with 21 points).
    *   Uses a powerful, server-side machine learning model to classify the gesture.
    *   Returns the gesture label and a confidence score.

---

**Document End.**
This blueprint provides a high-level overview of the current gesture recognition architecture. For detailed implementation code and alternative solutions, see `docs/ExpoGestureRecognition.md`.