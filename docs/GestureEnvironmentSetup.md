# Gesture Environment Setup

This guide explains how to prepare the gesture recognition environment for Amy's Echo. The current implementation uses a **WebView** with MediaPipe for hand landmark detection and relies on a **server‑side classifier**. No TensorFlow Lite models are bundled with the mobile app.

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

## Download server model

The server requires MediaPipe's `gesture_recognizer.task` file for classification. Download it into `server/models/`:

```bash
npm run download-gesture-task --prefix server
```

If the file already exists you can skip this step.

## Verify the asset

After the download, confirm the file is present:

```bash
ls server/models
```

You should see `gesture_recognizer.task`.

## Next steps

With the server model in place you can launch the app with `npm run ios` or `npm run android` from the `app` directory. For details on the WebView-based recognition pipeline, see [`docs/ExpoGestureRecognition.md`](./ExpoGestureRecognition.md).

