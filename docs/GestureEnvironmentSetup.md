# Gesture Environment Setup

This guide explains how to prepare the gesture recognition environment for Amy's Echo. The current implementation uses a **WebView** with MediaPipe Tasks for on-device hand landmark detection and gesture classification via CDN. No TensorFlow Lite models are bundled with the mobile app.

## Prerequisites

- Node.js 18+
- npm
- Python 3 (for server tests)

Install the repository dependencies first:

```bash
npm install
npm install --prefix app
npm install --prefix server
pip install -r server/requirements.txt
```

## Next steps

Launch the app with `npm run ios` or `npm run android` from the `app` directory. For details on the WebView-based recognition pipeline, see [`docs/ExpoGestureRecognition.md`](./ExpoGestureRecognition.md).
