# Amy's Echo Gesture Model — Next Training Sprint

## Open Follow-ups
- [ ] Provide the production-ready baseline `data/amy_model.npz` bundle and copy it into `server/data/models/global/amy_model.npz` during deploys. The server now auto-generates a neutral zero-weight model when this file is absent, so development builds no longer fail, but the real artifact is still required for production accuracy. Coordinate with the MLP training pipeline owners to fetch the latest artifact and record its SHA256 checksum in this document once available so future contributors can verify integrity before placing it in the repository.

We have MediaPipe capture working in the app and a Python MLP trainer on the server. The next sprint turns that flow into a repeatable loop so new caregiver recordings refresh the model (globally and per profile) without manual JSON hacks.

## 1. Capture Rich Samples in the App (`app/`)
- [x] Upgrade `app/src/components/MediaPipeGestureDetector.tsx`'s WebView bundle (`app/webview/gestureDetector.ts`) to stream a rolling buffer of JPEG frames alongside the existing landmark payload. Include a sample `postMessage` body in code comments:
  ```json
  {
    "type": "FRAME_BATCH",
    "landmarks": [...],
    "frames": ["data:image/jpeg;base64,..."]
  }
  ```
- [x] Extend `app/src/screens/TrainingScreen.tsx` to record both the landmark timeline and a short video clip while `isRecording` is true. Reuse `createTrainingSample` helpers so every saved item contains `{ profileId, label, landmarks, clipUri }`.
- [x] Persist the richer sample shape in `saveTrainingSample` (`app/src/storage.ts`). Rewrite all callers (e.g. `app/src/services/trainingSync.ts`) to expect the new structure so there is no legacy shape left behind.

## 2. Package & Queue Upload Bundles (`app/src/services`)
- [x] Replace `sendDgsSample` with `uploadTrainingBundle` that zips `{metadata.json, landmarks.json, clip.mp4}` using `expo-file-system`. Provide an inline example of the metadata file:
  ```json
  {
    "profileId": "123",
    "label": "HILFE",
    "capturedAt": "2024-05-28T12:03:11Z",
    "source": "app://mediapipe"
  }
  ```
- [x] Store pending bundles per profile in AsyncStorage (keys `trainingBundles:<profileId>:[timestamp]`). Flush them through `app/src/services/trainingSync.ts` under Wi-Fi + charging checks using the existing `scheduleSync` pattern.
- [x] Add unit coverage in `app/test/services/trainingSync.test.ts` that mocks the queue and asserts the zip payload matches the example above.

## 3. Ingest Bundles on the Server (`server/`)
- [x] Implement `/api/v1/dgs/sample-bundles` in `server/src/server.ts` that accepts multipart uploads. Save bundles under `data/uploads/<profileId>/<timestamp>/` and register them in `data/datasets/training_manifest.json`.
- [x] Update the caregiver moderation portal (`server/src/portal/index.ts`) to display bundle metadata and play the attached clip before approval. Point reviewers to the stored manifest entries instead of `db.gestureTrainingData`.
- [x] Write integration tests in `server/test/trainingBundles.test.ts` that POST a fixture zip and assert the manifest entry (include a fixture example in `server/test/fixtures/trainingBundle.zip`).

## 4. Retrain the Model with Bundle Data (`server/src/amyserver_tools`)
- [x] Extend `train_mlp.py` to load from `training_manifest.json`, extracting landmarks either from `landmarks.json` or by running MediaPipe on the stored clip. Cache extracted landmarks back to `data/uploads/.../landmarks_cached.json`.
- [x] Produce both global (`data/models/global/amy_model.npz`) and per-profile weights (`data/models/<profileId>/amy_model.npz`). Document the function that filters by `profileId` inside `train_mlp.py` with a docstring example.
- [x] Emit a structured training report (JSON) that `/train-model` returns so the app can display "Dein Modell ist jetzt aktualisiert" once the job finishes.

## 5. Distribute Updated Models Back to the App
- [x] Expand `server/src/server.ts`'s `/latest-mlp-model` handler to accept `?profileId=` and serve personalized bundles when available; fall back to the global model otherwise.
- [x] Update `app/src/services/dgsModelClient.ts` and the `useModelInjection` hook to request the personalized model first. Log which model version loads (for debugging) using `app/src/utils/logger.ts`.
- [x] Notify caregivers inside `app/src/screens/RecognitionScreen.tsx` when a newer version is injected. Use German copy that thanks them for contributing new gestures.

## 6. Verify & Document the Loop
- [x] Add end-to-end tests: one in `integration/` that records a fake gesture, uploads it, triggers `/train-model`, downloads the new weights, and asserts the model file checksum changes.
- [x] Document the flow in `docs/` with a sequence diagram (capture → bundle → moderation → training → distribution). Link directly to the implementation files listed above so new contributors have concrete starting points.
- [x] Create a manual QA checklist covering "record gesture", "bundle visible in portal", "training job succeeds", "personalized model downloaded".

---
**Immediate Task for the Coding Agent:** ✅ Spike `uploadTrainingBundle` end-to-end by zipping an existing landmark sample, POSTing it to a stubbed `/api/v1/dgs/sample-bundles`, and asserting the manifest entry is created.