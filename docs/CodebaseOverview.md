# Codebase Overview

This document summarizes the repository in seven key areas with concrete file references. See `spec/AmysEcho.md` for the full project specification and `docs/TODO.md` for the implementation checklist.

## 1. Mobile App Structure
- React Native code lives in `app/`
- Navigation and screens are in `app/src/screens/`
- Services and hooks are in `app/src/services/` and `app/src/hooks/`

## 2. Gesture Recognition Pipeline
- `app/src/screens/RecognitionScreen.tsx` runs the frame processor
- Models are loaded via `app/src/hooks/useTensorflowModel.ts`
- Default model paths live in `app/src/constants/modelPaths.ts`

## 3. Training and Personalization
- Sample collection UI in `app/src/screens/TrainingScreen.tsx`
- Personalized models managed in `app/src/screens/AdminScreen.tsx`
- Server training logic in `server/src/train.py` and `server/src/services/mlService.ts`

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

