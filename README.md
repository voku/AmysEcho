<!-- Generated: 2026-02-04 21:30:00 UTC -->

# Amy's Echo

[![Open Source – MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![100% Vibe Coded](https://img.shields.io/badge/built%20with-vibes-blueviolet)](#-open-source--vibe-coded)

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
| [Release Readiness v0.0.2](docs/planning/RELEASE_0.0.2_READINESS.md) | Go/No-Go checklist for the next version tag |

### Detailed Guides

- [Caregiver Guide](docs/guides/CaregiverGuide.md) — For parents and caregivers
- [Developer Quick Start + DB Init](docs/guides/DeveloperQuickStartAndDbInit.md) — Local setup, verification, SQLite re-init
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

## 🌍 Open Source & Vibe Coded

Amy's Echo is **100% open source** (MIT License) and **100% vibe coded** — every line written in partnership with AI assistants (GitHub Copilot Coding Agent), guided by one single priority: helping Amy communicate.

There is no product roadmap driven by business metrics. There is only Amy. If a feature helps her be understood, it ships. If it doesn't, it doesn't.

The source is public because other children deserve the same chance. If you use this to help another child, [open an issue and tell me](https://github.com/voku/AmysEcho/issues) — that matters more than any star or fork count.

---

## 🪙 Invest Your Remaining Copilot Requests of the Month

If you have a **GitHub Copilot** subscription (Individual, Business, or Enterprise), you receive a monthly allowance of Copilot **agent requests** (premium interactions). At the end of the month those credits reset — use them or lose them.

**Invest the remainder in Amy.** Here's how:

### Option A — Let the Agent work autonomously

1. Open the [Issues tab](https://github.com/voku/AmysEcho/issues) and pick any open issue tagged **`good first issue`**, **`help wanted`**, or **`enhancement`**.
2. In the issue comment, write:

   ```
   @github-copilot implement this
   ```

3. Copilot Coding Agent will open a pull request with a solution. Review it, leave feedback, and merge.

### Option B — Assign an issue to the Agent directly

1. Click **"Assign to Copilot"** from the issue sidebar (if your repo/org has the GitHub Copilot agent integration enabled).
2. The agent will create a branch, implement the feature, and open a PR automatically.

### Option C — Use the Agent in your fork

1. Fork this repo, enable Copilot in your account settings, and open VS Code.
2. Use **Copilot Chat → Agent mode** (`/implement`, `/fix`, or describe what you want).
3. The agent makes commits on your fork — open a PR back here when done.

### What to work on

| Tag | Description |
|-----|-------------|
| [`good first issue`](https://github.com/voku/AmysEcho/labels/good%20first%20issue) | Small, well-scoped tasks — perfect for an agent with a few tokens |
| [`help wanted`](https://github.com/voku/AmysEcho/labels/help%20wanted) | Larger improvements where AI assistance is especially welcome |
| [`enhancement`](https://github.com/voku/AmysEcho/labels/enhancement) | New features aligned with Amy's communication needs |
| [`bug`](https://github.com/voku/AmysEcho/labels/bug) | Reliability fixes — zero-failure is an Amy First principle |

> Every token you invest here goes directly toward helping a child with 22q11 Deletion Syndrome communicate. Thank you.

---

## Contributing

See [AGENTS.md](AGENTS.md) for development guidelines. German for user-facing text, tests colocated with source (webapp) or in `test/` (server).

---

## License

[MIT](LICENSE) — If you use this to help another child, let me know. That's why it's public.
