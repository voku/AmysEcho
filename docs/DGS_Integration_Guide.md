# German Sign Language (DGS) Integration Guide

This guide captures the current, webapp-based DGS integration pipeline. It replaces the
legacy React Native/WebView architecture and points to the canonical workflow docs.

## ✅ Current Integration Pipeline (Webapp + Server)

**Capture → Bundle → Upload → Training → Distribution**

1. **Capture**: `webapp/src/components/TrainingRecorder.tsx` and
   `webapp/src/hooks/useTrainingRecorder.ts` record multimodal landmarks
   (hands + pose + face) plus clip/still assets.
2. **Bundle**: `webapp/src/training/trainingBundle.ts` builds ZIP bundles
   (`metadata.json`, `landmarks.json`, optional `still.jpg` + `clip.*`).
3. **Upload**: `POST /api/v1/dgs/sample-bundles` ingests bundles and updates
   `server/data/datasets/training_manifest.json`.
4. **Train**: `server/src/amyserver_tools/train_mlp.py` trains global and per-profile
   `.npz` models from the manifest.
5. **Distribute**: `GET /latest-mlp-model?profileId=...` serves the latest model; the webapp
   injects weights via `webapp/src/hooks/useMlpModelInjection.ts`.

## API Endpoints (Server)

See [`docs/API.md`](./API.md) for full payload specs.

- `POST /api/v1/dgs/sample-bundles` — upload training bundles
- `POST /train-model` — trigger training
- `GET /latest-mlp-model?profileId=...` — download latest weights
- `GET /api/v1/train-status/:jobId` — check training job status

## Canonical Workflow Docs

- [`docs/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`](./VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
- [`docs/ML_LLM_Integration.md`](./ML_LLM_Integration.md)
- [`docs/MULTIMODAL_TRAINING_GUIDE.md`](./MULTIMODAL_TRAINING_GUIDE.md)

## Testing

Integration suites live under `integration/`:

```bash
npm test --prefix integration
```

For broader testing guidance, see [`docs/TESTING_STRATEGY.md`](./TESTING_STRATEGY.md).
