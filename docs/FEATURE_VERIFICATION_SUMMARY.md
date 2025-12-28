# Feature Verification Summary (Webapp)

**Date**: 2025-12-28  
**Scope**: Video capture, bundle upload, model training, and model distribution  
**Status**: ✅ Implemented in the webapp + server pipeline

This summary reflects the current webapp-based DGS flow. The legacy React Native
implementation has been removed from the repository; see `docs/APP_ARCHIVE.md`
for historical context.

## Verified Feature Areas

### ✅ Video Capture & Bundling
- Webapp uses MediaRecorder + MediaPipe.
- Bundles include `metadata.json`, `landmarks.json`, and optional `still.jpg`/`clip.*`.
- **Reference**: `webapp/src/components/TrainingRecorder.tsx`,
  `webapp/src/training/trainingBundle.ts`.

### ✅ Upload & Ingest
- `POST /api/v1/dgs/sample-bundles` ingests bundles and updates
  `server/data/datasets/training_manifest.json`.
- **Reference**: `server/src/routes/trainingBundleRoute.ts`.

### ✅ Model Training
- `server/src/amyserver_tools/train_mlp.py` trains global + per-profile models.
- Outputs under `server/data/models/`.

### ✅ Model Distribution
- `GET /latest-mlp-model?profileId=...` serves weights.
- Webapp injects models via `useMlpModelInjection`.

## Canonical Workflow

See `docs/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md` for the end-to-end flow and
QA checklist.
