# Amy’s Echo

**This repository contains the development work for my little girl — to help her be understood, to help her learn, and to help others understand her world.**

Amy is four years old. She was born with **22q11 Deletion Syndrome** and communicates using **German Sign Language (DGS)**. Her gestures are expressive, her intent is clear — but most people around her don’t understand what she’s trying to say.

This project turns those gestures into speech and symbols so she can be heard anywhere.
Each child profile receives a personalized gesture model trained from its own samples, making the system effective for 22q11 workflows in group settings like kindergartens.
Runtime classification relies on downloaded MLP weight bundles cached on the device; no TFLite files remain in the project.

All app UI text and error messages are written in German to match Amy's language environment.

---

## 📚 Documentation

- [Codebase overview](docs/CodebaseOverview.md)
- [User stories](docs/UserStories.md)
- [Caregiver guide](docs/CaregiverGuide.md)
- [Build & test instructions](docs/BUILD_AND_TEST.md)
- [Android in WSL2 guide](docs/AndroidWSL2.md)
- [Gesture recognition best practices](docs/GESTURE_RECOGNITION_BEST_PRACTICES.md)
- [Real-world validation guide](docs/REAL_WORLD_VALIDATION_GUIDE.md)
- [Project roadmap](docs/TODO.md)
- [Project milestones](docs/ProjectMilestones.md) – Stabilization, Accuracy, UX improvements

---

## 🎯 Purpose

> Don’t build for everyone. Build for one. But do it well enough that everyone could follow.

Amy’s Echo is a gesture recognition system designed to translate DGS into speech and symbols — in real time, offline if needed, and always with clarity and care.

This is not a demo or experiment. It’s a production-grade, full-stack project with one goal:

> **Turn Amy’s gesture into understanding. Every time.**

---

## 🧱 Tech Stack

| Layer         | Tech                          | Purpose                                |
|---------------|-------------------------------|----------------------------------------|
| Web Framework | React + Vite                  | Fast browser-based application         |
| Language      | TypeScript (strict mode)      | Predictable, type-safe code            |
| ML Engine     | MediaPipe + Amy's Echo MLP    | Real-time gesture recognition & personalization |
| LLM Engine    | On-device caregiver prompt engine | Contextual caregiver prompts and reassurance |
| Camera        | Browser MediaDevices API      | In-browser camera feed & landmark detection |
| Backend API   | Node/Express server           | Sample upload, training, model serving |
| Audio         | Web Audio API, Speech Synthesis | Speech output + sound effects          |
| Database      | IndexedDB (via OPFS)          | Local storage for offline support      |

---

## 🤖 Enhanced Gesture Detection System

Amy's Echo features a comprehensive gesture recognition system optimized for 22q11 syndrome accessibility:

### Core Features
- **ML-Powered Recognition**: MediaPipe hand tracking feeding our own MLP classifier
- **Caregiver Feedback Engine**: Lightweight local templates keep praise and prompts instant
- **Emergency Priority**: <50ms response for critical gestures
- **Adaptive Thresholds**: Personalized confidence levels (0.12-0.32 range)
- **German Localization**: All feedback in Amy's native language
- **Performance Monitoring**: Real-time latency and accuracy tracking
- **Intelligent Fallback**: Local heuristics and personalized models validate uncertain gestures

### Supported Gestures
- 👊 **Faust** (Fist) - Basic closed hand
- 👆 **Zeigefinger** (Point) - Index finger extended
- 👍 **Daumen hoch** (Thumbs up) - Thumb raised
- 🖐️ **Offene Hand** (Open palm) - All fingers extended
- ✌️ **Peace** - Two fingers extended
- ✋ **Vier Finger** - Four fingers extended
- 🖕 **Mittelfinger** - Middle finger (alternative point)
- 👌 **Drei Finger** - Three fingers extended
- ⭕ **Kreis-Geste** - Thumb and index finger circle

### Amy First Principles
✅ **Zero interruption** - Communication never pauses
✅ **Zero confusion** - Clear German feedback always
✅ **Zero delay** - Instant response for all gestures
✅ **Zero failure** - Multiple fallback layers
✅ **Zero judgment** - Celebrates all attempts

---

## 🚀 Quick Start

### Development Setup

```bash
npm ci --prefix webapp
npm ci --prefix server
pip install -r server/requirements.txt
npm ci --prefix integration

npm run type-check --prefix webapp
npm test --prefix webapp
npm run type-check --prefix server
npm test --prefix server
npm test --prefix integration

npm run build --prefix server
```

Commands use `--prefix` and should be run from the repository root.

### Server Deployment

For deploying the server to production:

- **Quick Start**: See [QUICKSTART_SERVER.md](QUICKSTART_SERVER.md) for a 5-minute Docker deployment
- **Complete Guide**: See [docs/SERVER_DEPLOYMENT.md](docs/SERVER_DEPLOYMENT.md) for comprehensive deployment options including Docker, systemd, nginx, SSL, monitoring, and backups

### Webapp Deployment

For deploying the webapp:

- See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for GitHub Pages and static hosting deployment

### Run notes

- **Server:**
   - MediaPipe assets load via CDN; no manual model download is required.
   - Build + start: `npm run build --prefix server && ./scripts/server-start.sh`
- **Webapp:**
   - Development: `npm run dev --prefix webapp`
   - Production build: `npm run build --prefix webapp`
- Uses `demo-token` by default for auth.

### How to use it

1. Start server (required for training + model serving):
   - `npm run build --prefix server && ./scripts/server-start.sh`
2. Run webapp:
   - Development: `npm run dev --prefix webapp`
   - Access at http://localhost:5173
3. Workflow:
   - Use Training page to record samples for key DGS gestures (per child).
   - Use Recognition page; when it's wrong, correct it; the webapp uploads the sample for that child.
   - Recognition runs locally in browser; as training samples accumulate, personalized MLP weights improve confidence.

See [docs/BUILD_AND_TEST.md](docs/BUILD_AND_TEST.md) for full details.

---

## Process

You will:
1. **Analyze the codebase systematically** across seven key areas.
2. **Create or update `docs/*.md`** with file references for each area.
3. **Synthesize documentation** into this concise README.
4. **Remove duplication** so the docs complement rather than repeat each other.

---

## 🧠 Architecture: Hybrid-First

Amy’s Echo is designed around a hybrid loop:

1. **See**: Capture gesture via camera.
2. **Think**: Run ML classification (cloud preferred, local fallback).
3. **Speak + Show**: Output voice and symbol.
4. **Confirm**: Gentle haptic + visual confirmation.
5. **Learn**: Corrections are logged, models adapt over time.

Fallbacks are not optional. The system must **always** respond — even when uncertain.

---

## 🔵 Interaction Flows (HIPs)

| Protocol | Purpose                                  |
|----------|------------------------------------------|
| HIP 1    | Onboarding (consent, first-use setup)    |
| HIP 2    | Teach mode (caregiver trains a new sign) |
| HIP 3    | Correction mode (“Help Me” repair flow)  |
| HIP 4    | Maintenance (“Let’s practice this again”)|

---

## 🗃️ Core Goals

- **Turn gestures into speech and visuals**
- **Reliable by default (hybrid)**: Gestures are classified on-device using cached MLP weights, while the server handles sample uploads, training, and model distribution.
- **Handle uncertainty with grace, not silence**
- **Log every correction to learn and adapt**
- **Personalize models per child profile** so caregivers can train and deploy custom gestures for each 22q11 child
- **Make it simple for a child to succeed**

---

## Project Status

All major features for Phase 1, 2 and 3 have been implemented. The project is now in the optimization and production readiness phase. Development tasks are tracked in [`docs/TODO.md`](docs/TODO.md), which now serves as a living document for ongoing improvements and bug fixes.

The repository now focuses on the core gesture recognition loop: recording high-quality samples, uploading them to the server, training personalized models, and serving those models back to the browser client. Auxiliary caregiver portals, analytics dashboards, and dialog services have been removed so local development only requires the upload, training, and model-serving endpoints exposed by the Node server.

## ▶️ Running the Web Application

The webapp code lives in `webapp/`. Install dependencies with `npm install` inside that folder, then run `npm run dev` to start the development server at http://localhost:5173.

### Configuring the backend API

The training endpoints require authentication. Set the API URL and optionally a bearer token:

```bash
# Configure API endpoint (defaults to http://localhost:3000)
VITE_API_URL=http://localhost:5000

# Start the development server
npm run dev --prefix webapp
```

The webapp provides an API configuration panel where you can adjust the base URL and token during runtime.

### Building for Production

```bash
npm run build --prefix webapp
```

The production build is output to `webapp/dist/` and can be deployed to any static hosting service.

### Build & Test Workflow

1. **Run the full test suite** before building:

   ```bash
   npm run type-check --prefix webapp
   npm run lint --prefix webapp
   npm test --prefix webapp
   pip install -r server/requirements.txt
   npm test --prefix server
   ```

   You can also execute `./scripts/full-check.sh` from the repo root to run all checks at once.

For more detailed build and testing instructions, see [docs/BUILD_AND_TEST.md](docs/BUILD_AND_TEST.md).

---

## 🔗 Local Dev: Webapp + Server (End‑to‑End)

Start the backend server and connect the webapp to it during development.

1) Start the server (Terminal A)

```
npm run build --prefix server
./scripts/server-start.sh
```


- Uses `PORT=5000` and `API_TOKEN=demo-token` by default.
- Stores the latest MLP model at `server/data/models/global/amy_model.npz` once training completes.
- Neue Zugänge können per `POST /api/v1/auth/register` erstellt und per `POST /api/v1/auth/login` angemeldet werden. Die
  Endpunkte geben JWTs zurück und funktionieren parallel zum Legacy-Token. Passwort-Anforderungen: 6-128 Zeichen,
  Nutzername: 3-50 Zeichen.

2) Start the webapp (Terminal B)

\`\`\`
VITE_API_URL=http://localhost:5000 npm run dev --prefix webapp
\`\`\`

- Opens the webapp at http://localhost:5173
- Connects to the local server for gesture uploads and model downloads.

3) Verify connectivity

- Server logs show requests to `/latest-mlp-model` and `/api/*`.
- Webapp console should not show network errors.

---

## Contributing

This is a focused project with one user. That means:

- Clean code, tested assumptions
- No "move fast" hacks
- Emotional context matters - build with care

If you're here to help: thank you.
PRs are welcome, but **read the [spec](spec/AmysEcho.md)** and the contributor guides in `AGENTS.md` and `server/AGENTS.md` first.

---

## 📄 License

MIT – But with one request:
**If you use this work to help another child — let me know.** That’s why it’s public.

---

## ❤️ Built For

**Amy.**
To help her be understood.
To help her learn.
To help the world finally listen.
