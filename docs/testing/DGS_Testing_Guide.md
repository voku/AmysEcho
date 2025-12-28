# DGS Integration Testing Guide

The German Sign Language (DGS) stack is verified through the same test suites we
use during day-to-day development. This document highlights the pieces that
exercise the real capture → training → distribution loop.

## Automated Coverage Snapshot

### Integration (integration/test/api.test.js)

This Node test boots the production server build, provisions a throwaway
training dataset, and makes real HTTP requests against the Express app. It
verifies:

- **Training endpoints** – `POST /train-model` rejects malformed payloads and
  accepts valid landmark arrays.
- **Training jobs** – `/api/v1/train-status/:id` reaches the `completed` state before
  the timeout expires and returns the progress payload expected by the app.
- **Model distribution** – `GET /model-version` and
  `GET /latest-mlp-model?profileId=` return the binary `.npz` contents and the
  accompanying metadata so the webapp cache stays consistent.
- **Bundle ingestion** – `POST /api/v1/dgs/sample-bundles` accepts the same zip
  structure that the webapp uploads and automatically schedules a new training
  job.

Because the test hits the compiled server, it also exercises the Python trainer
(`server/src/amyserver_tools/train_mlp.py`) and the filesystem layout under
`server/data`.

### Server Unit & Integration Tests

A few TypeScript suites keep the ingestion and distribution pieces honest even
before the end-to-end test runs:

- `server/test/trainingBundles.test.ts` and
  `server/test/trainingBundleIngestor.test.ts` validate manifest creation,
  cleanup logic, and multipart parsing.
- `server/test/latestMlpModelRoute.test.ts` plus
  `server/test/model-version.test.ts` ensure headers, profile-based fallbacks,
  and caching semantics match what the app expects.
- `server/test/test_train_endpoint.py` covers the Python job runner and mirrors
  the exact CLI arguments the integration test uses.

### Webapp Tests

Webapp suites cover UI and bundle creation behavior:

- `webapp/src/components/TrainingRecorder.test.tsx` covers training capture UI.
- `webapp/src/training/trainingBundle.test.ts` validates ZIP payloads and metadata.
- `webapp/src/gesture/__tests__/GestureRecognitionOrchestrator.test.ts` covers
  clip capture and overlay flows.

## Running Tests Locally

```bash
# Install dependencies once
npm ci --prefix server
npm ci --prefix webapp
npm ci --prefix integration

# Webapp + server unit tests
npm test --prefix webapp
npm test --prefix server

# Full DGS integration loop (starts the real server build)
npm test --prefix integration
```

The integration command uses Node's built-in test runner via `tsx` and takes a
few minutes because it compiles the server and executes the Python trainer.

## Debugging Integration Runs

Capture the full log when investigating flakes:

```bash
npm test --prefix integration | tee integration/test-output.log
```

Useful log markers:

- `Received DGS sample` – upload succeeded and the bundle hit disk.
- `Training job completed` – the Python script produced weights.
- `latest-mlp-model serving global file ...` or `latest-mlp-model resolved
  profile file ...` – `/latest-mlp-model` streamed bytes from disk and the
  trainer cache updated.

## Manual QA & Accessibility

Automated coverage keeps the pipeline stable, but Amy-first UX checks still
happen manually:

- Follow the checklist in `docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md` to
  verify capture → upload → training → download end-to-end.
- Verify caregiver workflows per `docs/testing/REAL_WORLD_VALIDATION_GUIDE.md` whenever
  a new model ships.

Keep this guide updated whenever a new automated suite is introduced so the team
knows exactly which behaviors are enforced by code and which ones still require
manual QA.
