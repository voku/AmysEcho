# Amy's Echo Sign Language Model — Training & Recognition

## Open Follow-ups
- [ ] Provide the production-ready baseline `data/amy_model.npz` bundle and copy it into `server/data/models/global/amy_model.npz` during deploys. The server now automatically generates a neutral zero-weight model when this file is absent. Development builds therefore continue to work, but production accuracy still depends on the real artifact. Coordinate with the MLP training pipeline owners to fetch the latest artifact and record its SHA256 checksum in this document once available so future contributors can verify integrity before placing it in the repository.
- [ ] **Define training data quality criteria for generic sign language model**: Establish metrics and validation rules to determine when per-user training data is good enough to be incorporated into the global model that everyone uses. This includes: minimum sample count per sign, quality thresholds for landmark consistency, diversity requirements (different users, lighting, angles), and a review/approval workflow for promoting user contributions to the baseline model.

We have MediaPipe capture working in the webapp and a Python MLP trainer on the server. The training flow enables new caregiver recordings to refresh the sign language recognition model (globally and per profile) with automatic model distribution.

## 1. Capture Sign Language Samples in the Webapp (`webapp/`)
- [x] Upgrade the sign language detector (`webapp/src/gesture/`) to stream a rolling buffer of frames alongside the existing landmark payload.
- [x] Extend the Training page to record both the landmark timeline and captured frames while recording is active.
- [x] Persist the sample shape in the training queue (`webapp/src/training/trainingQueue.ts`). Use IndexedDB via OPFS for offline support.

## 2. Package & Queue Upload Bundles (`webapp/src/training`)
- [x] Create `uploadTrainingBundle` that builds a zip with `{metadata.json, landmarks.json, still.jpg}`.
- [x] Store pending bundles in IndexedDB. Flush them through the training uploader hook as soon as connectivity is available.
- [x] Add unit coverage that mocks the queue and asserts the zip payload structure.

## 3. Ingest Sign Language Training Bundles on the Server (`server/`)
- [x] Implement `/api/v1/dgs/sample-bundles` in `server/src/server.ts` that accepts multipart uploads. Save bundles under `data/uploads/<profileId>/<timestamp>/`, reject bundles missing `landmarks.json` with HTTP 400 after cleaning up, and register successful uploads in `data/datasets/training_manifest.json`.
- [x] Write integration tests in `server/test/trainingBundles.test.ts` that POST a fixture zip and assert the manifest entry.

## 4. Retrain the Sign Language Recognition Model with Bundle Data (`server/src/amyserver_tools`)
- [x] Extend `train_mlp.py` to load from `training_manifest.json`, extracting landmarks either from `landmarks.json` or by running MediaPipe on the stored clip. Cache extracted landmarks back to `data/uploads/.../landmarks_cached.json`.
- [x] Produce both global (`data/models/global/amy_model.npz`) and per-profile weights (`data/models/<profileId>/amy_model.npz`).
- [x] Emit a structured training report (JSON) that `/train-model` returns.

## 5. Distribute Updated Sign Language Models Back to the Webapp
- [x] Expand `server/src/server.ts`'s `/latest-mlp-model` handler to accept `?profileId=` and serve personalized bundles when available; fall back to the global model otherwise.
- [x] Update the webapp model client (`webapp/src/gesture/modelClient.ts`) to request the personalized model first.
- [x] Notify users when a newer model version is loaded.

## 6. Verify & Document the Sign Language Training Loop
- [x] Add end-to-end tests: one in `integration/` that records a fake sign, uploads it, triggers `/train-model`, downloads the new weights, and asserts the model file checksum changes.
- [x] Document the flow in `docs/` with a sequence diagram (capture → bundle → training → distribution).
- [x] Create a manual QA checklist covering "record sign", "bundle files present", "training job succeeds", "personalized model downloaded".

---
**Status:** Core sign language training loop implemented. The system captures hand landmarks via MediaPipe, trains per-user and global MLP models for Deutsche Gebärdensprache (DGS) recognition, and automatically distributes updated models to all devices. Focus is now on optimization, production readiness, and establishing quality criteria for promoting user training data to the global baseline model.