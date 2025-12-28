# Unified AI Implementation Blueprint (Webapp)

This blueprint summarizes the current on-device gesture recognition and
multimodal training pipeline in the webapp.

## Core Pipeline

1. **Capture** — `webapp/src/gesture/core/GestureDetector.ts` runs MediaPipe to
   extract hand/pose/face landmarks.
2. **Recognition** — `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`
   uses MLP weights injected at runtime to classify gestures.
3. **Training** — `webapp/src/training/trainingBundle.ts` packages multimodal
   samples for server ingestion.
4. **Distribution** — `GET /latest-mlp-model?profileId=...` serves updated
   models that the webapp injects via `useMlpModelInjection`.

## Canonical References

- [`docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`](../training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md)
- [`docs/research/ML_LLM_Integration.md`](../research/ML_LLM_Integration.md)
- [`docs/training/MULTIMODAL_TRAINING_GUIDE.md`](../training/MULTIMODAL_TRAINING_GUIDE.md)
