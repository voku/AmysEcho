# German Sign Language (DGS) Integration Guide

This guide captures the current, webapp-based DGS integration pipeline. It replaces the
legacy React Native/WebView architecture and points to the canonical workflow docs.

## ✅ Current Integration Pipeline (Webapp + Server)

## Capture → Bundle → Upload → Training → Distribution

1. **Capture**: `webapp/src/components/TrainingRecorder.tsx` and
   `webapp/src/hooks/useTrainingRecorder.ts` record multimodal landmarks
   (hands + pose + face) plus clip/still assets.
2. **Bundle**: `webapp/src/training/trainingBundle.ts` builds ZIP bundles
   (`metadata.json`, `landmarks.json`, optional `still.jpg` + `clip.*`).
3. **Upload**: `POST /api/v1/dgs/sample-bundles` ingests bundles and updates
   `server/data/datasets/training_manifest.json`.
4. **Train**: `server/src/amyserver_tools/train_mlp.py` trains global and per-profile
   `.npz` models from the manifest.
5. **Distribute**: `GET /api/v1/models/latest?profileId=...` serves the latest model; the webapp
   injects weights via `webapp/src/hooks/useMlpModelInjection.ts`.

## API Endpoints (Server)

See [`docs/integration/api.md`](../integration/api.md) for full payload specs.

- `POST /api/v1/dgs/sample-bundles` — upload training bundles
- `POST /api/v1/train-model` — trigger training
- `GET /api/v1/models/latest?profileId=...` — download latest weights
- `GET /api/v1/train-status/:jobId` — check training job status

## Canonical Workflow Docs

- [`docs/archive/training/video-recording-and-training-workflow.md`](../archive/training/video-recording-and-training-workflow.md)
- [`docs/research/ml-llm-integration.md`](../research/ml-llm-integration.md)
- [`docs/archive/training/multimodal-training-guide.md`](../archive/training/multimodal-training-guide.md)

## Testing

Integration suites live under `integration/`:

```bash
npm test --prefix integration
```

For broader testing guidance, see [`docs/testing/testing-strategy.md`](../testing/testing-strategy.md).
