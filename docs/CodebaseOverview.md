# Codebase Overview

This document summarizes the repository in seven key areas with concrete file references. See `spec/AmysEcho.md` for the full project specification and `docs/TODO.md` for the implementation checklist. For build and test instructions, see `docs/BUILD_AND_TEST.md`.

## 1. Mobile App Structure
- React Native code lives in `app/`
- Navigation and screens are in `app/src/screens/`
- Services and hooks are in `app/src/services/` and `app/src/hooks/`

## 2. Gesture Recognition Pipeline
- `app/src/components/MediaPipeGestureDetector.tsx` renders a WebView that extracts hand landmarks and classifies gestures on-device using MediaPipe Tasks JS loaded from a CDN.
- `app/src/screens/RecognitionScreen.tsx` hosts the detector, fuses results with cached centroids, and logs outcomes.
- `app/src/services/offlineClassifier.ts` performs centroid-based fallback classification when confidence is low.
- Legacy TFLite model paths remain only for tests; recognition is fully on-device.

## 3. Training and Personalization
- Sample collection UI in `app/src/screens/TeachingScreen.tsx`
- Centroid summaries and refresh actions live in `app/src/screens/AdminScreen.tsx`
- `app/src/services/trainingSync.ts` uploads samples and polls `/train-status` for progress
- Server recomputes centroids in `server/src/server.ts`, persisting data under `server/data/`

## 4. Dialog & OpenAI Integration
- Client requests handled in `app/src/services/dialogEngine.ts`
- Server logic in `server/src/services/dialogEngine.ts` with endpoints in `server/src/server.ts`

## 5. Adaptive Learning & Corrections
- Corrections stored via `app/src/model.ts` and synced in `app/src/services/syncService.ts`
- Adaptive logic in `server/src/services/adaptiveLearningService.ts`

## 6. Caregiver Portal & Analytics
- Web portal at `server/src/portal/index.ts` lists analytics, manages training data, and serves model downloads via `/portal`
- Portal routes are protected by token auth and rate limited
- Analytics collected in `server/src/services/analyticsService.ts`

## 7. Custom Audio Recording
- Recording logic in `app/src/services/audioService.ts`
- Audio files moved in `app/src/screens/AdminScreen.tsx`
- Recordings persist in `app/src/constants/audioPaths.ts` for offline playback

## 8. Performance Budget

The performance budget for the gesture recognition pipeline is as follows:

- **Frame Rate:** 10 FPS (100ms per frame)
- **Landmark Extraction:** < 30ms
- **Gesture Classification (local):** < 20ms

These are target values and should be validated on real devices.

Runtime enforcement of this budget is handled by the `AdaptivePerformanceManager` in `app/src/services/AdaptivePerformanceManager.ts`, which dynamically lowers frame rate and model complexity when battery levels are low or device thermal state rises.

## 9. Data Privacy & Profile Management
- All persistent data lives in `server/db.json`
- `GET /api/profiles/:id/export` returns a profile's stored data as JSON
- `DELETE /api/profiles/:id` removes a profile and associated usage/correction records to honor caregiver deletion requests
