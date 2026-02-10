# Production Checklist: Record → Preview → Upload → Train → Download Personalized Model

Use this checklist before every production release to confirm the full training loop works end-to-end with multimodal data (hands, pose, face) and personalized model delivery.

## Record
- [ ] Open the training recorder in the webapp and start a new recording.
- [ ] Confirm the camera feed is stable and that both hands stay in frame.
- [ ] Capture at least one clip with clear hand motion and a visible face.

## Preview
- [ ] Verify the overlay renders hands, pose, and face landmarks during recording.
- [ ] Confirm the overlay alignment tracks the live video (no drift or mirroring issues).
- [ ] Check that the primary hand indicator updates when hand focus is set.

## Upload
- [ ] Submit the recording and confirm the upload queue shows the bundle as `pending` then `uploaded`.
- [ ] Inspect the uploaded bundle on the server:
  - [ ] `data/uploads/<profileId>/<bundleId>/bundle.zip` exists.
  - [ ] Extracted files include `metadata.json` and `landmarks.json`.
  - [ ] `metadata.json` contains `modalities`, `smoothing`, `handFocus`, and optional `variationData`.
  - [ ] `landmarks.json` contains frames with `handLandmarks`, `poseLandmarks`, `faceLandmarks`, and `handedness`.

## Train
- [ ] Trigger training via `/train-model` (or confirm auto-trigger after bundle upload).
- [ ] Monitor `/api/v1/train-status/<jobId>` until `completed`.
- [ ] Verify `data/datasets/training_manifest.json` includes the new bundle entry with `validationSummary`.

## Download Personalized Model
- [ ] Request `/latest-mlp-model?profileId=<profileId>` from the webapp.
- [ ] Confirm the response headers indicate a personalized model (and not the global fallback).
- [ ] Validate the model file checksum differs from the previous version after training.

## Post-checks
- [ ] Run a quick recognition session to ensure the new model is in use.
- [ ] Trigger one intentionally weak recording (e.g., too few frames) and confirm it appears in `GET /api/v1/dgs/training-quality?profileId=<profileId>`.
- [ ] Verify the webapp Training page shows the same rejection under **Abgelehnte Aufnahmen** with understandable German guidance.
- [ ] Record any anomalies (missing modalities, upload failures, training errors) in the release log.
