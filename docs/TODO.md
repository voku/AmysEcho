# Amy's Echo Sign Language Model — Training & Recognition

## Open Follow-ups
- [ ] Ship a kid-focused, production-ready DGS baseline model: curate the starter vocabulary (colors, food, caregiver phrases), train a balanced multimodal model, and place the resulting `data/amy_model.npz` under `server/data/models/global/` with a recorded SHA256 checksum so deploys always carry working weights.
- [ ] **Finalize quality and consent gates for user-generated training data:** define per-sign minimums, jitter thresholds for hand/pose/face stability, and review steps before promoting caregiver uploads into the global baseline. Document consent handling for child recordings and ensure manifests retain license info end to end.
- [ ] Close the multimodal feedback loop in production: validate that camera overlay previews (hands + pose + face) match what the server ingests, confirm smoothing/feature metadata is preserved through training, and add an E2E checklist for “record → preview → upload → train → download personalized model”.

We have MediaPipe capture working in the webapp and a Python MLP trainer on the server. The training flow enables new caregiver recordings to refresh the sign language recognition model (globally and per profile) with automatic model distribution.

## 1. Capture Sign Language Samples in the Webapp (`webapp/`)
- [x] Upgrade the sign language detector (`webapp/src/gesture/`) to stream a rolling buffer of frames alongside the existing landmark payload.
- [x] Extend the Training page to record both the landmark timeline and captured frames while recording is active.
- [x] Persist the sample shape in the training queue (`webapp/src/training/trainingQueue.ts`). Use IndexedDB via OPFS for offline support.
- [x] Harden multimodal capture for kids: verify pose/face/hand landmark availability across supported browsers/devices, and surface guidance when a modality drops (e.g., "Please keep face in frame").
- [ ] Add privacy-safe preview controls: allow caregivers to toggle raw video vs. skeleton-only while keeping overlay drawing for hands/pose/face visible.

## 2. Package & Queue Upload Bundles (`webapp/src/training`)
- [x] Create `uploadTrainingBundle` that builds a zip with `{metadata.json, landmarks.json, still.jpg}`.
- [x] Store pending bundles in IndexedDB. Flush them through the training uploader hook as soon as connectivity is available.
- [x] Add unit coverage that mocks the queue and asserts the zip payload structure.
- [ ] Ensure multimodal bundle fidelity: confirm `metadata.json` and `landmarks.json` keep pose/face features, handedness, smoothing params, and add regression tests that fail if fields are dropped.

## 3. Ingest Sign Language Training Bundles on the Server (`server/`)
- [x] Implement `/api/v1/dgs/sample-bundles` in `server/src/server.ts` that accepts multipart uploads. Save bundles under `data/uploads/<profileId>/<timestamp>/`, reject bundles missing `landmarks.json` with HTTP 400 after cleaning up, and register successful uploads in `data/datasets/training_manifest.json`.
- [x] Write integration tests in `server/test/trainingBundles.test.ts` that POST a fixture zip and assert the manifest entry.
- [ ] Mirror client bundle richness: validate that ingested samples persist pose/face landmarks, derived features (e.g., lip-pointing distance), smoothing metadata, and consent/license details into dataset manifests without dropping fields.
- [ ] Add ingestion-level analytics: log counts of missing modalities, rejected bundles, and per-profile coverage so we can spot shaky cameras or poor lighting before training.

## 4. Retrain the Sign Language Recognition Model with Bundle Data (`server/src/amyserver_tools`)
- [x] Extend `train_mlp.py` to load from `training_manifest.json`, extracting landmarks either from `landmarks.json` or by running MediaPipe on the stored clip. Cache extracted landmarks back to `data/uploads/.../landmarks_cached.json`.
- [x] Produce both global (`data/models/global/amy_model.npz`) and per-profile weights (`data/models/<profileId>/amy_model.npz`).
- [x] Emit a structured training report (JSON) that `/train-model` returns.
- [ ] Promote multimodal training: add pose/face inputs and non-manual features to the trainer, support modality dropout, and benchmark accuracy vs. current hand-only MLP.
- [ ] Provide a “kid starter” training preset: pre-load the trainer with core DGS glosses, class weights, and data splits that reflect the curated vocabulary.

## 5. Distribute Updated Sign Language Models Back to the Webapp
- [x] Expand `server/src/server.ts`'s `/latest-mlp-model` handler to accept `?profileId=` and serve personalized bundles when available; fall back to the global model otherwise.
- [x] Update the webapp model client (`webapp/src/gesture/modelClient.ts`) to request the personalized model first.
- [x] Notify users when a newer model version is loaded.
- [ ] Surface modality coverage and training version in model headers so caregivers know they are using the multimodal DGS model without forcing additional language tags.

## 6. Verify & Document the Sign Language Training Loop
- [x] Add end-to-end tests: one in `integration/` that records a fake sign, uploads it, triggers `/train-model`, downloads the new weights, and asserts the model file checksum changes.
- [x] Document the flow in `docs/` with a sequence diagram (capture → bundle → training → distribution).
- [x] Create a manual QA checklist covering "record sign", "bundle files present", "training job succeeds", "personalized model downloaded".
- [ ] Extend manual and automated QA for multimodal overlays: include steps/screenshots showing landmark previews (hand/pose/face), expected German guidance when modalities are missing, and the end-to-end path from preview to personalized model download.
- [ ] Track latency and reliability: add metrics collection for capture → upload → training → download timings, and publish a weekly dashboard to ensure the full cycle stays within the kid-friendly budget (<50 ms/frame inference, fast uploads on spotty connections).

---
**Status:** Core sign language training loop implemented. The system captures hand landmarks via MediaPipe, trains per-user and global MLP models for Deutsche Gebärdensprache (DGS) recognition, and automatically distributes updated models to all devices. Focus is now on optimization, production readiness, and establishing quality criteria for promoting user training data to the global baseline model.
