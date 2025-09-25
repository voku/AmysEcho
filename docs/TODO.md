# Amy's Echo Gesture Model — Training Loop Backlog

## Baseline We Already Have
- **On-device detection:** `app/src/components/MediaPipeGestureDetector.tsx` streams landmarks from the MediaPipe WebView and already refreshes cached MLP weights via `useModelInjection`.
- **Capture UI:** `app/src/screens/TrainingScreen.tsx` records `TrainingFrame[]` sequences, validates them, saves them with `saveTrainingSample`, and emits per-frame uploads with `sendDgsSample`.
- **Storage helpers:** `app/src/storage.ts` keeps per-profile sample queues; `app/src/services/gestureRecorder.ts` can sample consistent landmark sequences from the detector feed.
- **Server endpoints:** `server/src/server.ts` exposes `/api/v1/dgs/samples` (landmark ingest) and `/train-model` (kicks off Python training), persisting data under `data/dgs_samples.json`.
- **Python trainer:** `server/src/amyserver_tools/train_mlp.py` converts landmark JSON into an `amy_model.npz` MLP bundle consumed by the WebView model injection.

## Objective
Enable the MediaPipe-driven capture flow in `app/` to feed Amy's existing Python video-training stack so that curated caregiver recordings produce refreshed global and per-profile models without relying on ad-hoc JSON dumps.

## 1. Capture Enhancements (app/)
- [ ] Extend `MediaPipeGestureDetector`'s WebView bundle (`app/webview/gestureDetector.new.ts`) to surface buffered camera frames (JPEG snapshots via `FrameCaptureManager`) alongside landmarks through the existing `onWebViewEvent` channel.
- [ ] In `TrainingScreen.tsx`, add a session recorder that collects both the landmark timeline and a short MP4/WebM clip (generated from the captured frames) while `isRecording` is true.
- [ ] Persist the richer sample payload in `saveTrainingSample` (store `videoUri` + `frames`) and guard uploads behind the caregiver opt-in flags that already live on `Profile`.

## 2. Upload Packaging (app/)
- [ ] Replace the per-frame `sendDgsSample` calls with a new `uploadTrainingBundle` service that zips `{metadata.json, landmarks.json, clip.mp4}` and POSTs it; reuse the handedness flattening helpers from `app/src/services/dgsTrainingService.ts` for backwards compatibility.
- [ ] Reuse `app/src/services/gestureRecorder.ts` to down-sample long sessions before packaging so that uploads stay within mobile bandwidth limits (target <5 MB per gesture).
- [ ] Queue bundles in AsyncStorage per profile and flush them through a background task once Wi-Fi + charging conditions are met (extend the existing scheduler pattern in `app/src/services/trainingSync.ts`).

## 3. Server Intake & Dataset Assembly (server/)
- [ ] Add `/api/v1/dgs/sample-bundles` in `server/src/server.ts` to accept multipart/zip uploads, validate auth, and store payloads under `data/uploads/<profile>/<timestamp>/`.
- [ ] Extract landmarks server-side using the same schema produced by the WebView (fall back to JSON inside the bundle if provided) and run MediaPipe landmarking for clips that only contain raw video.
- [ ] Normalize and append approved samples to a structured dataset manifest (`data/datasets/caregiver_samples.parquet` or similar) instead of the ad-hoc `dgs_samples.json`; keep a shim writer so the legacy `/api/v1/dgs/samples` path continues to feed the JSON until the transition completes.
- [ ] Extend the caregiver moderation portal (`server/src/portal/index.ts`) to browse bundles, play clips, and mark sessions as "approved for training" before they move into the manifest.

## 4. Python Training Pipeline (server/src/amyserver_tools)
- [ ] Teach `train_mlp.py` to read from the new manifest (support both JSON and Parquet) so the same script can be reused for existing DSG video exports and app-recorded clips.
- [ ] When clips are present, run MediaPipe landmark extraction offline as part of the training job (call out to a new helper module that mirrors the WebView normalization) and cache the derived landmarks for reuse.
- [ ] Emit per-profile datasets by filtering on `profileId` in the manifest and produce adapter files (e.g., `data/models/<profile>/amy_model.npz`) so the app can request personalized weights.
- [ ] Update the training job log emitted from `/train-model` to include counts of raw clips vs. landmark-only samples so we can monitor coverage.

## 5. Model Distribution & App Integration
- [ ] Expand `server/src/server.ts` `/latest-mlp-model` to handle optional `profileId` and serve the personalized adapters with proper cache headers.
- [ ] Update `app/src/services/dgsModelClient.ts` and the `useModelInjection` hook to look for a personalized bundle first and gracefully fall back to the global model if none exists.
- [ ] After a successful download, notify caregivers inside `TrainingScreen` / `RecognitionScreen` that a new model trained from their videos is active (German copy, align with Amy First messaging).

## 6. Verification & Documentation
- [ ] Add automated tests: web (MediaPipe capture events), app (bundle upload queue), and server (ingestion + training pipeline) to cover the new flow end-to-end.
- [ ] Document the capture → upload → moderation → training → distribution pipeline in `docs/` with a sequence diagram and explicit references to `MediaPipeGestureDetector`, `train_mlp.py`, and the new endpoints so future contributors can retrace the flow quickly.
- [ ] Record a manual QA checklist covering "new caregiver records gesture," "bundle appears in portal," "Python job trains," and "app downloads updated model".

---
**Next Action:** Prototype the bundle upload by stubbing `uploadTrainingBundle` to wrap the existing landmark JSON and verify the server can unpack and append it via a temporary integration test.
