# Amy's Echo Gesture Model Training Backlog (LLM Working Notes)

This backlog turns the high-level roadmap into implementation-ready next steps for the model improvement loop. Every section includes the concrete entry points that already exist in the repo so the next iteration can extend them instead of starting from scratch.

## 🔍 Reference Map of Existing Hooks
- **App capture UX** – `app/src/screens/TrainingScreen.tsx`
  - `startRecording`/`stopRecording` already drive MediaPipe capture, call `saveTrainingSample`, and stream each `TrainingFrame` to the server via `sendDgsSample`.
  - Example: `stopRecording` validates sequences with `validateLandmarkSequence` before calling `sendDgsSample(gestureId, frame, profile?.id)` for every frame.
- **Local persistence** – `app/src/storage.ts`
  - `saveTrainingSample` stores samples per active profile (`gestureTrainingData_${profile}`) so that per-child personalization is already supported client-side.
- **Upload service** – `app/src/services/dgsTrainingService.ts`
  - `sendDgsSample` flattens landmarks with handedness helpers and POSTs to `/api/v1/dgs/samples` with bearer auth.
- **Server ingestion** – `server/src/server.ts`
  - `/api/v1/dgs/samples` validates 42×[x,y,z] arrays, assigns IDs with `genId()`, and appends to `data/dgs_samples.json` inside a file lock.
  - `/api/v1/dgs/mlp-model` and `/latest-mlp-model` stream profile-aware model binaries with cache headers.
- **Curation tooling** – `server/src/portal/index.ts`
  - Caregiver portal endpoints list, approve, and export training data (`addGestureTrainingData`, `updateGestureTrainingData`).
- **Training scripts** – `server/src/tools/autoRetrain.ts` & `server/src/amyserver_tools/train_mlp.py`
  - `autoRetrain` shells out to the Python MLP trainer with temp JSON built from corrections and negative samples.
  - `train_mlp.py` loads `data/dgs_samples.json`, normalizes frames, and trains a NumPy MLP while printing JSON progress events.
- **Model consumers** – `app/src/model.ts`, `app/src/services/optimizedGestureService.ts`
  - `gestureModel.gestures` is the single source of truth for vocab updates; downstream services like `optimizedGestureService` expose filtered views for the UI and recognition flow.

## 🧭 Execution Backlog

### 1. In-App Capture & Consent UX
- [ ] Extend `TrainingScreen` to gate recording behind an explicit caregiver opt-in modal summarizing capture scope (videos vs. landmarks) and storage duration.
  - Wire acceptance to a persisted flag in `app/src/storage.ts` so that opt-in can be per profile; fall back to prompting again if the profile changes.
- [ ] Add contextual help bubbles in `TrainingScreen` that reuse `setMessage` to explain why landmarks are recorded and how they improve recognition (copy in German).
- [ ] Record lightweight session analytics (e.g., frames captured, validation errors) via `logHIPEvent` to feed future quality dashboards.

### 2. Sample Packaging & Background Upload
- [ ] Introduce a batching helper (e.g., `queueTrainingUpload(samples: TrainingSample[])`) that groups the frame-by-frame `sendDgsSample` calls into a single encrypted payload when the caregiver chooses "upload now".
  - Use the existing offline storage in `saveTrainingSample` and include `profileId` so the server can differentiate personalization candidates.
- [ ] Schedule background flushes via the existing job infrastructure (`app/src/services/dailyJobs.ts`) to retry uploads when Wi‑Fi + charging criteria are met.
- [ ] Add retry/backoff semantics to `sendDgsSample` (wrap abort controller errors into a queue) and emit German toasts when retries exhaust.

### 3. Server Ingestion, Review & Quality Control
- [ ] Expand the `/api/v1/dgs/samples` schema to accept optional metadata (lighting, caregiver notes) and persist alongside `label`/`profileId` in `data/dgs_samples.json`.
- [ ] Build a moderation queue UI in the caregiver portal that surfaces the newest entries from `data/dgs_samples.json`, reusing the endpoints in `server/src/portal/index.ts` for approve/delete actions.
- [ ] Implement automated validators server-side (e.g., blur detection, min frame count) that mirror the client `validateLandmarkSequence` heuristics before records are marked `approved`.
- [ ] Provide an export endpoint that bundles approved samples plus metadata into a signed archive for offline review.

### 4. Training Pipeline Automation
- [ ] Update `autoRetrain` to read both curated portal data and raw `dgs_samples.json`, tagging the temp file with provenance so `train_mlp.py` can weight samples.
- [ ] Enhance `train_mlp.py` to compute per-gesture F1/latency stats and emit them as JSON logs for `server/src/server.ts` to capture in `training-debug.log`.
- [ ] Store trained weight blobs under `data/models/{modelVersion}/` alongside metadata (hyperparameters, dataset hashes) and upload summaries to the caregiver portal.
- [ ] Prototype per-profile fine-tuning by passing a `profileId` filter into `train_mlp.py`, generating adapter weights that the app can download via `/latest-mlp-model?profileId=...`.

### 5. Distribution & App Integration
- [ ] Add ETag/hash headers to `/api/v1/dgs/mlp-model` so `app/src/model.ts` can skip downloads when the on-device hash matches.
- [ ] Implement a `modelUpdateService` in the app that checks the server route after successful training uploads and swaps in new weights without resetting `gestureModel.gestures` state.
- [ ] Surface release notes inside `PracticeSessionManager` once `gestureModel` reloads, pulling changelog strings from the distribution response.
- [ ] Cache personalized models per profile directory (align with `saveCustomModelUri` / `saveCustomModelHash`) to ensure instant rollback on degraded accuracy.

### 6. Monitoring & Feedback Loop
- [ ] Feed training job progress (`server/src/server.ts` training job registry) into caregiver dashboards so they can watch when their uploads trigger retraining.
- [ ] Aggregate post-deployment metrics (recognition accuracy, emergency gesture latency) and write them to a new `modelPerformance` collection in `server/src/db.ts` for portal visualization.
- [ ] Add hooks in `app/src/screens/RecognitionScreen.tsx` to prompt caregivers for quick feedback after a new model goes live, storing responses with the active `modelVersion`.
- [ ] Document the entire loop (capture ➜ upload ➜ approve ➜ train ➜ distribute ➜ monitor) in `docs/` with links back to each code touchpoint above so onboarding agents can ramp quickly.

---

**Quick Start for the Next Coding Session**
1. Re-read the Reference Map to pick the right extension point.
2. Choose one backlog item, trace the referenced files, and draft the interface change.
3. Align naming with existing services/components (`*Service`, `*Screen`, etc.).
4. Update or add Jest/API tests alongside the implementation to keep the loop reliable.
