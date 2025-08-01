# Gesture Environment Setup

This guide explains how to prepare the gesture recognition environment for Amy's Echo. It covers downloading the default MediaPipe models and where to place them so the app can load them.

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

## Download default models

The app relies on two TensorFlow Lite models:

- `hand_landmarker.tflite`
- `gesture_classifier.tflite`

They should live under `app/assets/models/`. The repository includes a helper script that downloads the latest versions from Google MediaPipe and saves them to that directory.

From the repository root run:

```bash
npm run build --prefix server
node server/dist/tools/downloadModels.js
```

If the files already exist you can skip this step.

## Verify the assets

After the download, confirm the files are present:

```bash
ls app/assets/models
```

You should see `gesture_classifier.tflite`, `hand_landmarker.tflite`, and `gesture_labels.json`.

## Next steps

With the models in place you can launch the app with `npm run ios` or `npm run android` from the `app` directory. For details on how the models are used at runtime, see [`docs/GestureRecognitionImplementationGuide.md`](./GestureRecognitionImplementationGuide.md).

