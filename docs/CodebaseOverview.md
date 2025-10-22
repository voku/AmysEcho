# Codebase Overview

This document summarizes the repository in key areas with concrete file references. See `spec/AmysEcho.md` for the full project specification and `docs/TODO.md` for the implementation checklist. For build and test instructions, see `docs/BUILD_AND_TEST.md`.

**Project Status:** All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness. The `docs/TODO.md` file serves as a living document for ongoing improvements.

## 1. Mobile App Structure
- React Native code lives in `app/`
- Navigation and screens are in `app/src/screens/`
- Services and hooks are in `app/src/services/` and `app/src/hooks/`
- Global state management is handled by React Contexts in `app/src/context/`
- Brand theming is centralised in `app/src/constants/colors.ts`, `typography.ts` and `themes.ts`; the default `amyEcho` theme powers die Kamera → Verlauf → Lernen-Schleife (die einzigen Tabs in der App: `Kamera`, `Verlauf`, `Lernen`).
- Workflow metadata for the Kamera → Verlauf → Lernen-Schleife now lives in `app/src/constants/workflow.ts`, providing navigation labels, hints, and icon choices alongside the caregiver/support destinations consumed by `WorkflowSupportLinks` und den Textbausteinen für `WorkflowStageHeader`.
- Die Kameraschleife selbst wird in `app/src/screens/RecognitionScreen.tsx` inzwischen als reduziertes Overlay dargestellt: Statuschip + Kamera-Rahmen + drei Handlungsbuttons („Stimmt“, „Lernen“, „Alternativen“). Im Erfolgsfall blendet ein `Selbstentdeckung`-Ribbon den narrativen Moment ein, während die detaillierte Timeline für erklärende Flächen wie Hero und Onboarding reserviert bleibt.
- `app/src/screens/HistoryScreen.tsx` erweitert den Verlauf um eine "Selbstentdeckung gesichert"-Highlight-Karte, die den zuletzt sicher erkannten Moment feiert und direkte Aktionen zurück zur Kamera oder in den Lernmodus anbietet. Karten im Verlauf nutzen das gleiche Vokabular („Selbstentdeckung bestätigt“, „Noch unsicher“, „Bitte prüfen“) und erzählen zu jedem Eintrag eine kurze Folgehandlung.

## 2. Gesture Recognition Pipeline
- `app/src/components/MediaPipeGestureDetector.tsx` renders a WebView that extracts hand landmarks and classifies gestures on-device using MediaPipe Tasks JS loaded from a CDN.
- `app/webview/gestureDetector.ts` compiles to `app/assets/gestureDetector.js`; a Jest test (`app/test/gestureDetectorBuild.test.ts`) keeps the bundle synced with its TypeScript source.
- `app/src/screens/RecognitionScreen.tsx` hosts the detector, consumes cached MLP weights, and logs outcomes.
- (removed) Centroid-based fallback classification has been retired in favor of MLP-only recognition.
- The pipeline is enhanced with contextual awareness (`app/src/services/contextAwareRecognitionService.ts`) and predictive gestures (`app/src/services/gestureSuggester.ts`).

## 3. Training and Personalization
- Sample collection UI in `app/src/screens/TrainingScreen.tsx`
- Model downloads and refresh actions live in `app/src/screens/AdminScreen.tsx`
- `app/src/services/trainingSync.ts` uploads samples and polls `/train-status` for progress
- Server maintains personalized MLP bundles in `server/src/server.ts`, persisting data under `server/data/models/`

## 4. Validation & OpenAI Integration
- Vision-based gesture validation flows through `app/src/services/openaiGestureValidationService.ts`
- Server endpoint `/api/gesture/validate-vision` proxies the OpenAI Vision call defined in `server/src/server.ts`

## 5. Adaptive Learning & Corrections
- Corrections stored via `app/db/models.ts` and synced in `app/src/services/syncService.ts`
- Adaptive logic in `server/src/services/adaptiveLearningService.ts`
- The app features automated content generation and smart practice sessions (integrated in `app/src/services/adaptiveLearningService.ts`).

## 6. Custom Audio Recording
- Recording logic in `app/src/services/audioService.ts`
- Audio files moved in `app/src/screens/AdminScreen.tsx`
- Recordings persist in `app/src/constants/audioPaths.ts` for offline playback

## 7. Performance Budget

The performance budget for the gesture recognition pipeline is as follows:

- **Frame Rate:** 10 FPS (100ms per frame)
- **Landmark Extraction:** < 30ms
- **Gesture Classification (local):** < 20ms

These are target values and should be validated on real devices.

## 8. Data Privacy & Profile Management
- `GET /api/profiles/:id/export` returns a profile's stored data as JSON
- `DELETE /api/profiles/:id` removes a profile and associated usage/correction records to honor caregiver deletion requests

## 9. Logging
- Unified logging is handled by `app/src/utils/logger.ts`, providing consistent formatting and log-level control across the app. Direct `console.*` calls are avoided.