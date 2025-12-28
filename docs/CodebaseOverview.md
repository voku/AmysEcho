# Codebase Overview

This document summarizes the repository in key areas with concrete file references. See `spec/AmysEcho.md` for the full project specification and `docs/TODO.md` for the implementation checklist. For build and test instructions, see `docs/BUILD_AND_TEST.md`.

**Project Status:** All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness. The `docs/TODO.md` file serves as a living document for ongoing improvements.

## 1. Web Application Structure
- The webapp code lives in `webapp/`
- React components are in `webapp/src/components/`
- Hooks are in `webapp/src/hooks/`
- Gesture recognition code is in `webapp/src/gesture/`
- Training queue and upload logic is in `webapp/src/training/`

## 2. Gesture Recognition Pipeline
- `webapp/src/gesture/` contains the gesture detection and classification code
- MediaPipe hand tracking is loaded from CDN and runs in the browser
- The MLP classifier uses cached weights fetched from the server
- Gesture detection is orchestrated by `GestureRecognitionOrchestrator.ts`
- Landmark stabilization and handedness normalization ensure consistent results

## 3. Training and Personalization
- Sample collection UI in `webapp/src/components/TrainingUpload.tsx`
- Training bundle queue in `webapp/src/training/trainingQueue.ts`
- Upload logic in `webapp/src/training/trainingBundle.ts`
- Server maintains personalized MLP bundles in `server/src/server.ts`, persisting data under `server/data/models/`

## 4. Model Integration
- Model downloads are handled by `webapp/src/gesture/modelClient.ts`
- The `useMlpModelInjection` hook manages model loading and hot reloading
- Personalized models are requested first, falling back to the global model

## 5. Server Architecture
- Node/Express server in `server/src/`
- Training endpoints: `/api/v1/dgs/sample-bundles` for uploads, `/train-model` for training
- Model serving: `/latest-mlp-model` with optional `?profileId=` for personalized models
- Python training scripts in `server/src/amyserver_tools/`

## 6. Performance Budget

The performance budget for the gesture recognition pipeline is as follows:

- **Frame Rate:** 10 FPS (100ms per frame)
- **Landmark Extraction:** < 30ms
- **Gesture Classification (local):** < 20ms

These are target values and should be validated in real browser environments.

## 7. Data Privacy & Profile Management
- `GET /api/v1/profiles/:id/export` returns a profile's stored data as JSON
- `DELETE /api/v1/profiles/:id` removes a profile and associated usage/correction records to honor caregiver deletion requests

## 8. Integration Tests
- Integration tests in `integration/` verify the full training loop
- Tests cover upload, training, and model distribution
