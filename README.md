# Amy's Echo

[![Open Source – MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**This repository contains the development work for my little girl — to help her be understood, to help her learn, and to help others understand her world.**

Amy is four years old. She was born with **22q11 Deletion Syndrome** and communicates using **Deutsche Gebärdensprache (DGS)** — German Sign Language. Her gestures are expressive, her intent is clear — but most people around her don't understand what she's trying to say.

This project turns those gestures into speech and symbols so she can be heard anywhere. Each child profile receives personalized gesture recognition trained from their own samples, making the system effective for 22q11 workflows in group settings like kindergartens.

All app UI text and error messages are written in German to match Amy's language environment.

## Current Focus

The project is being maintained in a **supported-core** mode.

Current first-class scope:

- caregiver auth and child profiles
- live gesture recognition
- low-confidence correction flow
- training capture/upload and profile-aware model updates
- symbol board fallback
- the minimum settings/help/admin needed to keep those flows usable

De-emphasized for now:

- analytics and progress dashboards
- tutorial/about/showcase pages
- reference-video surfaces
- pretraining and benchmark-heavy operator workflows as the main line of progress

---

## Quick Start

```bash
# Install
npm ci --prefix webapp && npm ci --prefix server
pip install -r server/requirements.txt

# Test
npm test --prefix webapp && npm test --prefix server

# Run
npm run build --prefix server && ./scripts/server-start.sh  # Terminal A
npm run dev --prefix webapp  # Terminal B → http://localhost:5173
```


### NPM Proxy Warning Cleanup

If your environment injects `npm_config_http_proxy` / `npm_config_https_proxy`, npm can print `Unknown env config "http-proxy"` warnings.
Use these shell helpers for clean output during checks:

```bash
./scripts/run-webapp-type-check-clean.sh
./scripts/run-webapp-lint-clean.sh
./scripts/run-webapp-build-clean.sh
./scripts/run-server-type-check-clean.sh
```

---

## Supported Core

The canonical scope document is [Supported Core](docs/architecture/supported-core.md).

## Key Entry Points

| Component | File | Purpose |
|-----------|------|---------|
| Webapp | `webapp/src/App.tsx` | Main React app, routing |
| Gesture Detection | `webapp/src/gesture/core/GestureDetector.ts` | MediaPipe integration |
| Recognition | `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts` | MLP classification |
| Training | `webapp/src/training/trainingBundle.ts` | Sample bundling for upload |
| Server | `server/src/server.ts` | Express API, routes |
| MLP Trainer | `server/src/amyserver_tools/train_mlp.py` | Model training pipeline |

---

## Documentation

| Document | Contents |
|----------|----------|
| [Documentation Hub](docs/readme.md) | Canonical doc index and entry points |
| [Architecture](docs/architecture/codebase-overview.md) | System design, component map, data flow |
| [Supported Core](docs/architecture/supported-core.md) | Current supported product boundary |
| [Build + Test](docs/workflows/build-and-test.md) | Build commands, verification flow |
| [Testing Strategy](docs/testing/testing-strategy.md) | Test structure, commands, patterns |
| [Development Workflow](docs/workflows/development-workflow.md) | Code style, workflows, patterns |
| [Deployment](docs/deployment/deployment.md) | Server/webapp deployment, Docker |
| [TODO](docs/planning/todo.md) | Current priorities, roadmap |

### Detailed Guides

- [Caregiver Guide](docs/guides/caregiver-guide.md) — For parents and caregivers
- [Developer Quick Start + DB Init](docs/guides/developer-quick-start-and-db-init.md) — Local setup, verification, SQLite re-init
- [Training Workflow](docs/training/video-recording-and-training-workflow.md) — Recording and training gestures
- [Testing Strategy](docs/testing/testing-strategy.md) — Core test approach

---

## Tech Stack

- **Webapp**: React + Vite + TypeScript
- **Server**: Node/Express + Python (training)
- **ML**: MediaPipe landmarks + Custom MLP classifier
- **Database**: SQLite (server), IndexedDB (client)
- **UI Language**: German (user-facing), English (developer)

---

## Contributing

See [agents.md](agents.md) for development guidelines. German for user-facing text, tests colocated with source (webapp) or in `test/` (server).

---

## License

[MIT](LICENSE) — If you use this to help another child, let me know. That's why it's public.
