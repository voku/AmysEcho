<!-- Generated: 2026-02-04 21:30:00 UTC -->

# Amy's Echo

**This repository contains the development work for my little girl — to help her be understood, to help her learn, and to help others understand her world.**

Amy is four years old. She was born with **22q11 Deletion Syndrome** and communicates using **Deutsche Gebärdensprache (DGS)** — German Sign Language. Her gestures are expressive, her intent is clear — but most people around her don't understand what she's trying to say.

This project turns those gestures into speech and symbols so she can be heard anywhere. Each child profile receives personalized gesture recognition trained from their own samples, making the system effective for 22q11 workflows in group settings like kindergartens.

All app UI text and error messages are written in German to match Amy's language environment.

---

## 🎯 Purpose

> Don't build for everyone. Build for one. But do it well enough that everyone could follow.

Amy's Echo is a gesture recognition system designed to translate DGS into speech and symbols — in real time, offline if needed, and always with clarity and care.

> **Turn Amy's gesture into understanding. Every time.**

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
| [Project Overview](docs/project-overview.md) | Purpose, tech stack, platform support |
| [Architecture](docs/architecture.md) | System design, component map, data flow |
| [Build System](docs/build-system.md) | Build commands, configurations |
| [Testing](docs/testing.md) | Test structure, commands, patterns |
| [Development](docs/development.md) | Code style, workflows, patterns |
| [Deployment](docs/deployment.md) | Server/webapp deployment, Docker |
| [Files Catalog](docs/files.md) | Complete file reference |
| [TODO](docs/planning/TODO.md) | Current priorities, roadmap |

### Detailed Guides

- [Caregiver Guide](docs/guides/CaregiverGuide.md) — For parents and caregivers
- [Training Workflow](docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md) — Recording and training gestures
- [Server Deployment](docs/deployment/SERVER_DEPLOYMENT.md) — Production deployment
- [Testing Strategy](docs/testing/TESTING_STRATEGY.md) — Comprehensive testing approach

---

## Tech Stack

- **Webapp**: React + Vite + TypeScript
- **Server**: Node/Express + Python (training)
- **ML**: MediaPipe landmarks + Custom MLP classifier
- **Database**: SQLite (server), IndexedDB (client)
- **UI Language**: German (user-facing), English (developer)

---

## Contributing

See [AGENTS.md](AGENTS.md) for development guidelines. German for user-facing text, tests colocated with source (webapp) or in `test/` (server).

---

## License

MIT — If you use this to help another child, let me know. That's why it's public.
