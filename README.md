# Amy’s Echo

**This repository contains the development work for my little girl — to help her be understood, to help her learn, and to help others understand her world.**

Amy is four years old. She was born with **22q11 Deletion Syndrome** and communicates using **German Sign Language (DGS)**. Her gestures are expressive, her intent is clear — but most people around her don’t understand what she’s trying to say.

This project turns those gestures into speech and symbols so she can be heard anywhere.

---

## 📚 Documentation

- [Codebase overview](docs/CodebaseOverview.md)
- [User stories](docs/UserStories.md)
- [Kindergarten staff field guide](docs/KindergartenWorkflow.md)
- [Build & test instructions](docs/BUILD_AND_TEST.md)
- [Android in WSL2 guide](docs/AndroidWSL2.md)
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
| App Framework | React Native (CLI)            | Cross-platform + native module access  |
| Language      | TypeScript (strict mode)      | Predictable, type-safe code            |
| Camera        | `react-native-vision-camera`  | High-performance gesture capture       |
| ML Inference  | `react-native-fast-tflite`    | Local fallback via TensorFlow Lite     |
| Cloud ML      | Custom API                    | Accurate gesture classification        |
| UI/UX         | RN Animated API + Skia (opt.) | Gentle, trust-based feedback           |
| Audio         | `expo-audio`, `expo-speech`   | Speech output + sound effects          |
| Video         | `expo-video`                  | Video output                           |
| Database      | WatermelonDB (SQLite)         | Encrypted, offline-first local storage |

---

## 🚀 Quick Start

```bash
npm install --prefix app
npm install --prefix server
pip install -r server/requirements.txt

npm run type-check --prefix app
npm test --prefix app
npm test --prefix server
npm test --prefix integration

npm run build --prefix server
node server/dist/tools/downloadModels.js
```

Run `npm run ios --prefix app` or `npm run android --prefix app` to launch the mobile app.

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
- **Work offline-first, no cloud dependency**
- **Handle uncertainty with grace, not silence**
- **Log every correction to learn and adapt**
- **Make it simple for a child to succeed**

---

## 🚧 Current Status

- [x] Spec ([markdown](./spec/AmysEcho.md))
- [x] React Native baseline setup
- [x] Camera + ML integration (initial hybrid recognizer)
- [x] HIP 1 + HIP 3 MVP implementation
- [x] HIP 2 training flow stub

## Project Status & Open Todos

For the full implementation roadmap, see [`docs/TODO.md`](docs/TODO.md). The repository includes a complete gesture recognition pipeline, training flow, adaptive learning service, multi-profile management, an expanded analytics dashboard, custom audio support, and a caregiver web portal under `server/src/portal/`. When the backend server is running, visit `http://localhost:5000/portal` to manage training data, view analytics, and download the latest personalized model.

---

## 🤝 Contributing

This is a focused project with one user. That means:

- ✅ Clean code, tested assumptions
- ✅ No “move fast” hacks
- ✅ Emotional context matters — build with care

If you’re here to help: thank you.
PRs are welcome, but **read the [spec](spec/AmysEcho.md) first**.

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

