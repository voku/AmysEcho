# Gesture Environment Setup

This guide explains how to prepare the gesture recognition environment for Amy's Echo. The current implementation runs fully in the webapp, using MediaPipe Tasks for on-device landmark detection and local MLP inference.

## Prerequisites

- Node.js 18+
- npm
- Python 3 (for server tests)

Install the repository dependencies first:

```bash
npm install
npm install --prefix webapp
npm install --prefix server
pip install -r server/requirements.txt
```

## Next steps

Launch the webapp with `npm run dev --prefix webapp`. For details on the recognition pipeline, see [`docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`](../training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md).
