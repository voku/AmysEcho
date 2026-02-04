# Amy's Echo Architecture

<!-- Generated: 2026-02-04 21:00:00 UTC -->

## Overview

Amy's Echo is a multimodal communication platform for non-verbal children, focused on Deutsche Gebärdensprache (DGS) gesture recognition. The system captures gestures via webcam, processes them through MediaPipe hand tracking and MLP-based classification, and provides real-time visual/audio feedback. Training data flows from the webapp to the server for model retraining and redistribution.

The architecture follows a client-server pattern: a React/TypeScript webapp handles all gesture detection and UI locally, while an Express/TypeScript server manages user profiles, training data ingestion, and model training via Python tools. IndexedDB provides offline storage on the client; SQLite handles server-side persistence.

The codebase prioritizes reliability for Amy's communication needs. All user-facing text is in German. LLM-optimized patterns favor standard library calls over custom abstractions.

## Component Map

| Component | Location | Purpose |
|-----------|----------|---------|
| **Webapp Entry** | `webapp/src/App.tsx` | React app root, routing, context providers |
| **Gesture Core** | `webapp/src/gesture/core/` | Camera, detection, orchestration |
| **Gesture Utils** | `webapp/src/gesture/` | Model loading, processing, performance |
| **Training Client** | `webapp/src/training/` | Bundle creation, queue, validation |
| **UI Components** | `webapp/src/components/` | All React UI components |
| **Client Services** | `webapp/src/services/` | API client, profiles, backup, audio |
| **Client Hooks** | `webapp/src/hooks/` | React hooks for state/effects |
| **Server Entry** | `server/src/server.ts` | Express app setup, middleware |
| **API Routes** | `server/src/routes/` | REST endpoints (auth, training, symbols) |
| **Server Services** | `server/src/services/` | Business logic, training ingestion |
| **Python Tools** | `server/src/amyserver_tools/` | MLP training (`train_mlp.py`) |
| **Database** | `server/src/sqliteDb.ts`, `db.ts` | SQLite persistence layer |

## Key Files

### Gesture Pipeline
- `webapp/src/gesture/core/GestureDetector.ts` — MediaPipe integration, hand landmark extraction
- `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts` — Coordinates detection pipeline steps
- `webapp/src/gesture/modelClient.ts` — Loads/manages MLP model
- `webapp/src/gesture/gestureProcessing.ts` — Feature extraction, preprocessing

### Training System
- `webapp/src/training/trainingQueue.ts` — Queues samples for upload
- `webapp/src/training/trainingBundle.ts` — Bundles samples for server
- `server/src/services/trainingBundleIngestor.ts` — Processes uploaded bundles
- `server/src/amyserver_tools/train_mlp.py` — Python MLP trainer

### Services
- `webapp/src/services/apiClient.ts` — HTTP client for server communication
- `webapp/src/services/profileRegistry.ts` — Local profile management
- `server/src/services/authService.ts` — Authentication logic
- `server/src/services/mlpModelArtifacts.ts` — Model storage/retrieval

### Database
- `server/src/sqliteDb.ts` — SQLite connection/queries
- `server/src/db.ts` — Database initialization

## Data Flow

### Recognition Flow
```
Camera → CameraManager.ts
       → MediaPipe (via GestureDetector.ts)
       → Hand landmarks
       → gestureProcessing.ts (feature extraction)
       → modelClient.ts (MLP prediction)
       → GestureRecognitionOrchestrator.ts
       → UI feedback (components/)
```

### Training Flow
```
User records gesture → trainingQueue.ts (queue sample)
                     → trainingBundle.ts (create bundle)
                     → apiClient.ts (upload)
                     → trainingBundleRoute.ts (receive)
                     → trainingBundleIngestor.ts (process)
                     → train_mlp.py (retrain model)
                     → mlpModelArtifacts.ts (store)
                     → latestMlpModelRoute.ts (distribute)
                     → modelClient.ts (client downloads)
```

## Cross-References

- [SYSTEM_ARCHITECTURE_MAP.md](architecture/SYSTEM_ARCHITECTURE_MAP.md) — Detailed subsystem relationships
- [ADR.md](architecture/ADR.md) — Architecture Decision Records
- [CodebaseOverview.md](architecture/CodebaseOverview.md) — Code organization details
- [TODO.md](planning/TODO.md) — Current priorities and status
