<!-- Generated: 2026-02-04 21:30:00 UTC -->

# Amy's Echo

A multimodal communication platform translating **Deutsche Gebärdensprache (DGS)** into speech and symbols for non-verbal children. Each child receives personalized gesture recognition trained from their own samples.

**Built for Amy** — a four-year-old with 22q11 Deletion Syndrome who communicates in German Sign Language.

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
