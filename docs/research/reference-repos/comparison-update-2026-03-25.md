# Comparison Update (DGS Detection + Training)

Date: 2026-03-25

## Fetch status

- Attempted to fetch pinned reference files with:
  - `node scripts/fetch-reference-sources.mjs --out-dir tmp/reference-sources --retries 1`
- Environment result: outbound access to `raw.githubusercontent.com` is currently unreachable (`ENETUNREACH`), so comparison remains based on pinned references listed in `sources.json` and the previously captured gap analysis.

## Current alignment snapshot

### 1) Detection runtime (camera + loop resilience)
- **Reference pattern** (MediaPipe/browser repos): guard startup lifecycle, avoid brittle camera-loop transitions.
- **Amy's Echo now**:
  - Adaptive camera quality tiers in `webapp/src/gesture/core/CameraManager.ts`
  - Metadata readiness guard before `video.play()` on startup and adaptive swaps
  - Stream registration/unregistration via `ResourceManager`
- **Assessment**: Strong alignment for browser reliability patterns.
- **Compared Amy files**:
  - `webapp/src/gesture/core/CameraManager.ts`
  - `webapp/src/hooks/useSignLanguageDetector.ts`
  - `webapp/src/gesture/core/GestureDetector.ts`

### 2) Real-time signal quality telemetry
- **Reference pattern** (kinivi-style demos): continuously measure throughput/FPS and keep diagnostics lightweight.
- **Amy's Echo now**:
  - `SmoothedFpsMeter` + periodic detector FPS telemetry
  - Startup milestone telemetry (`camera_start_requested_at`, `camera_stream_ready_at`, `detector_first_frame_at`, `startup_latency_ms`)
- **Assessment**: Strong alignment plus production telemetry depth beyond reference demos.
- **Compared Amy files**:
  - `webapp/src/gesture/utils/SmoothedFpsMeter.ts`
  - `webapp/src/gesture/core/GestureDetector.ts`
  - `docs/training/training-metrics-dashboard.md`

### 3) Training/inference feature consistency
- **Reference pattern** (ML pipeline repos): keep a single normalization contract between capture, training, and prediction.
- **Amy's Echo now**:
  - Canonical hand contract in `webapp/src/training/landmarkFeatureContract.ts`
  - Webapp inference paths aligned (`installMlp.ts`, `landmarkNormalizer.ts`)
  - Server normalization aligned (`server/training/frame_normalization.py`)
  - **New in this update**: ingestion-level compatibility guard rejects mismatched `metadata.featureContract.version` in `server/src/services/trainingBundleIngestor.ts`
- **Assessment**: Strong alignment with stricter dataset hygiene than baseline references.
- **Compared Amy files**:
  - `webapp/src/training/landmarkFeatureContract.ts`
  - `webapp/src/gesture/installMlp.ts`
  - `webapp/src/gesture/utils/landmarkNormalizer.ts`
  - `server/training/frame_normalization.py`
  - `server/src/services/trainingBundleIngestor.ts`

## Adopt / Adapt / Avoid decisions

- **Adopt**: explicit, single contract for landmark normalization end-to-end.
- **Adopt**: lightweight runtime diagnostics (FPS + startup milestones) for production debugging.
- **Adapt**: demo-style FPS and camera loops into production-safe lifecycle/cleanup handling.
- **Avoid**: accepting mixed preprocessing contracts into the same training corpus.

## Recommended next comparison step (once fetch succeeds)

1. Re-run fetch script with `--retries 3`.
2. Diff the downloaded `kinivi/app.py` preprocessing against:
   - `webapp/src/training/landmarkFeatureContract.ts`
   - `server/training/frame_normalization.py`
3. Record any numeric drift (centering/scaling/ordering) in a small parity table and add targeted tests for each drift category.
