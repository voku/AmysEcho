<!-- Generated: 2026-02-04 21:00:00 UTC -->

# Amy's Echo - Project Overview

## Brief Overview

Amy's Echo is a multimodal communication platform designed for non-verbal children, with a primary focus on Deutsche Gebärdensprache (DGS) - German Sign Language. The platform enables children to communicate through gesture recognition, with each child receiving personalized gesture models trained on their unique signing patterns.

The recognition pipeline uses MediaPipe for hand/pose/face landmark detection combined with a custom MLP (Multi-Layer Perceptron) classifier for gesture classification. Audio features can also be integrated for multimodal training. The system prioritizes reliability, simplicity, and zero-interruption communication following "Amy First" development principles.

## Key Files

### Entry Points
| File | Purpose |
|------|---------|
| `webapp/src/App.tsx` | Main React application with routing and app state |
| `server/src/server.ts` | Express API server with training and profile endpoints |
| `server/src/amyserver_tools/train_mlp.py` | MLP training script for gesture models |

### Core Gesture Recognition
| File | Purpose |
|------|---------|
| `webapp/src/gesture/core/GestureDetector.ts` | Gesture detection orchestrator using MediaPipe |
| `webapp/src/gesture/core/CameraManager.ts` | Camera feed management |
| `webapp/src/gesture/core/OverlayRenderer.ts` | Visual feedback overlay |

### Configuration
| File | Purpose |
|------|---------|
| `webapp/package.json` | Webapp dependencies (React 19, Vite, Vitest) |
| `server/package.json` | Server dependencies (Express 5, better-sqlite3) |
| `webapp/vite.config.ts` | Vite build config with test setup |

## Technology Stack

### Webapp (`webapp/`)
- **Framework**: React 19 + TypeScript
- **Build**: Vite 7.x
- **Testing**: Vitest + Testing Library + happy-dom
- **Routing**: react-router-dom v7

### Server (`server/`)
- **Runtime**: Node.js 18+ with Express 5
- **Database**: better-sqlite3
- **Auth**: bcrypt + jsonwebtoken
- **Validation**: Zod
- **Python Tools**: NumPy-based MLP training in `src/amyserver_tools/`

### ML Pipeline
- **Landmark Detection**: MediaPipe (gesture, pose, face landmarkers)
- **Classification**: Custom MLP trained per-profile
- **Training**: Python with NumPy (`train_mlp.py`)

## Platform Support

### Requirements
- **Node.js**: >= 18.13.0
- **Python**: 3.x with NumPy (for training tools)
- **Browser**: Modern browser with WebGL and camera access
- **Camera**: Required for gesture capture

### Development Commands
```bash
# Webapp
npm ci --prefix webapp
npm run dev --prefix webapp        # Development server
npm test --prefix webapp           # Run tests
npm run build --prefix webapp      # Production build

# Server
npm ci --prefix server
pip install -r server/requirements.txt
npm run build --prefix server      # Compile TypeScript
npm run start --prefix server      # Start API server
```
