# Amy's Echo File Catalog

<!-- Generated: 2026-02-04 21:00:00 UTC -->

## Overview

This catalog helps LLMs quickly locate key files in the Amy's Echo codebase. Amy's Echo is a multimodal communication platform for non-verbal children, focused on Deutsche Gebärdensprache (DGS) gesture capture, training, and playback.

The repository follows a monorepo structure with three main components: `webapp/` (React + TypeScript frontend), `server/` (Node.js + Express backend with Python training tools), and `integration/` (end-to-end tests). Each component has its own `package.json` and test suite.

When modifying code, check existing patterns in similar files first. User-facing text must be in German. Follow the Amy First development principles documented in `AGENTS.md`.

---

## Core Source Files

### Webapp Entry Points

| File | Description |
|------|-------------|
| `webapp/src/main.tsx` | React DOM entry point, mounts App to root element |
| `webapp/src/App.tsx` | Main React app with routing, context providers, top-level state |
| `webapp/vite.config.ts` | Vite build configuration, plugins, dev server settings |

### Gesture Pipeline

| File | Description |
|------|-------------|
| `webapp/src/gesture/core/GestureDetector.ts` | MediaPipe Hands integration, raw landmark detection |
| `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts` | Coordinates detection, processing, and recognition flow |
| `webapp/src/gesture/modelClient.ts` | Downloads trained models from server, caches locally |
| `webapp/src/gesture/gestureProcessing.ts` | Landmark normalization, tremor compensation, feature extraction |

### Training System

| File | Description |
|------|-------------|
| `webapp/src/training/trainingQueue.ts` | IndexedDB-backed queue for offline training data collection |
| `webapp/src/training/trainingBundle.ts` | Packages training samples into bundles for server upload |

### Server Core

| File | Description |
|------|-------------|
| `server/src/server.ts` | Express app setup, middleware, route mounting |
| `server/src/routes/` | API route handlers (auth, training, symbols, models) |
| `server/src/services/` | Business logic services (training orchestration, model management) |

### Python Training Tools

| File | Description |
|------|-------------|
| `server/src/amyserver_tools/train_mlp.py` | MLP model trainer, reads bundles, outputs trained models |
| `server/src/amyserver_tools/feature_pipeline.py` | Feature extraction and preprocessing for training |

---

## Build & Configuration Files

### Root Level

| File | Description |
|------|-------------|
| `package.json` | Workspace root scripts (orchestrates webapp/server) |
| `docker-compose.yml` | Container orchestration for development/deployment |
| `pyproject.toml` | Python project configuration |

### Component Configuration

| File | Description |
|------|-------------|
| `webapp/package.json` | Webapp dependencies, scripts (build, test, lint) |
| `webapp/tsconfig.json` | TypeScript config for webapp |
| `server/package.json` | Server dependencies, scripts |
| `server/tsconfig.json` | TypeScript config for server |
| `server/requirements.txt` | Python dependencies for training tools |

---

## Data & Models

| Path | Description |
|------|-------------|
| `server/data/models/` | Trained gesture recognition models |
| `server/data/config/` | Configuration presets and defaults |
| `data/` | Shared data resources |

---

## Reference

### Directory Conventions

- `src/components/` - React UI components (webapp)
- `src/hooks/` - Custom React hooks (webapp)
- `src/services/` - API clients and external service wrappers
- `src/context/` - React context providers
- `src/types/` - TypeScript type definitions
- `src/utils/` - Utility functions
- `test/` or colocated `*.test.ts` - Test files

### Naming Conventions

- **Components**: PascalCase (`GestureCard.tsx`)
- **Hooks**: camelCase with `use` prefix (`useGestureRecognition.ts`)
- **Services**: camelCase (`trainingService.ts`)
- **Types**: PascalCase interfaces/types in `*.types.ts` or `types/`
- **Tests**: Same name as source with `.test.ts` suffix

### Quick Lookup

| Question | Files to Check |
|----------|---------------|
| Where does the app start? | `webapp/src/main.tsx` → `App.tsx` |
| How does gesture detection work? | `webapp/src/gesture/core/GestureDetector.ts` |
| How is training data stored? | `webapp/src/training/trainingQueue.ts` (IndexedDB) |
| Where are API routes defined? | `server/src/routes/` |
| How are models trained? | `server/src/amyserver_tools/train_mlp.py` |
| What are current priorities? | `docs/planning/todo.md` |
