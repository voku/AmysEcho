# Amy’s Echo

**This repository contains the development work for my little girl — to help her be understood, to help her learn, and to help others understand her world.**

Amy is four years old. She was born with **22q11 Deletion Syndrome** and communicates using **German Sign Language (DGS)**. Her gestures are expressive, her intent is clear — but most people around her don’t understand what she’s trying to say.

This project aims to fix that.

---

## 🎯 Purpose

> Don’t build for everyone. Build for one. But do it well enough that everyone could follow.

Amy’s Echo is a gesture recognition system designed to translate DGS into speech and symbols — in real time, offline if needed, and always with clarity and care.

This is not a demo or experiment. It’s a production-grade, full-stack project with one goal:

> **Turn Amy’s gesture into understanding. Every time.**

---

## 🧱 Tech Stack? 

| Layer             | Tech                          | Purpose                                           |
|------------------|-------------------------------|---------------------------------------------------|
| App Framework     | React Native (CLI)            | Cross-platform + native module access             |
| Language          | TypeScript (strict mode)      | Predictable, type-safe code                       |
| Camera            | `react-native-vision-camera`  | High-performance gesture capture                  |
| ML Inference      | `react-native-fast-tflite`    | Local fallback via TensorFlow Lite                |
| Cloud ML          | Custom API                    | Accurate gesture classification                   |
| UI/UX             | RN Animated API + Skia (opt.) | Gentle, trust-based feedback                      |
| Audio             | `expo-av`, `expo-speech`      | Speech output + sound effects                     |
| Database          | WatermelonDB (SQLite)         | Encrypted, offline-first local storage            |

---

## ⚡ Quick Setup

1. `npm install` – install root dependencies
2. `cd app && npm install` – install mobile app deps
3. `npm test` – run the Node test suite
4. Inside `app`, run `npm run ios` or `npm run android` to launch the app

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

The project has a stable foundation after a major refactor. The database, navigation, and core app structure are complete. The next steps focus on implementing the scaffolded features to reach the goal defined in `/spec/AmysEcho.md`.

**For detailed implementation instructions, see [`docs/TODO.md`](docs/TODO.md) and [`docs/UnifiedAIImplementationBlueprint.md`](docs/UnifiedAIImplementationBlueprint.md).**

-### Priority 1: Activate Core Functionality
- [x] **Implement Gesture Recognition**: The `mlService.ts` now loads the TFLite model and performs live gesture classification.
- [x] **Implement Rich Audio Feedback**: The `audioService.ts` plays success and error sounds using `expo-av`.

-### Priority 2: Enhance with Intelligence & Accessibility
- [x] **Integrate Live LLM Dialog Engine**: `dialogEngine.ts` now makes a live OpenAI API request for suggestions.
- [x] **Add DGS Video Playback**: DGS videos can be shown via a toggle on the `LearningScreen`.

### Priority 3: Polish and Administration
- [x] **Complete Admin Panel**: CRUD functionality in `AdminScreen.tsx` manages symbols and vocabularies.
- [ ] **UI/UX Polish**: Conduct a full review of the UI to improve layouts, feedback, and add accessibility labels to all interactive elements.

### Priority 4: Personalized AI Pipeline
- [ ] **Acquire Pre-trained Models**: Download and bundle the MediaPipe models.
- [ ] **Implement Two-Stage Frame Processor**: Load landmark and gesture models inside a `useFrameProcessor` worklet.
- [ ] **Build TrainingScreen UI**: Provide a guided interface for recording gesture samples.
- [ ] **Implement In-Memory Landmark Extraction**: Use ffmpeg to pull frames and save landmarks only.
- [ ] **Create Secure LLM Dialog Endpoint**: Proxy OpenAI requests through an authenticated server.
- [ ] **Create Model Training Endpoint & Script**: Accept uploaded landmarks and train an LSTM gesture model.
- [ ] **Create Model Download Endpoint**: Serve the latest personalized model to the app.
- [ ] **Implement Model Download and Activation**: Download the `.tflite` model and store its URI securely.
- [ ] **Activate the Personalized Model**: Use the custom model in the Learning screen when available.

## ▶️ Running the mobile app

The React Native code lives in `app/`. Install dependencies with `npm install` inside that folder, then run `npm run ios` or `npm run android` to start a simulator. This skeleton includes onboarding, recognition, correction and training screens. Camera and ML integration now have an initial hybrid recognizer stub.

DGS demonstration videos can be placed under `app/assets/videos/dgs/`. Each gesture entry may specify a `videoUri` and optional `dgsVideoUri` pointing to these files. A toggle on the recognition screen lets you switch between the standard symbol video and the DGS version when available.

The LLM-powered suggestions require an OpenAI API key. You can set this via the `OPENAI_API_KEY` environment variable, place the key in a local `.openai-key` file, or save it securely using the Admin screen. Never commit keys to the repository.

### Building the custom dev client

If you want to run the app on a physical device with a custom dev client, execute `npx expo prebuild` inside `app/` once to generate the native projects. Afterwards use `npm run ios` or `npm run android` to install the dev client on your device.

### Creating production builds

To generate store-ready binaries using EAS Build, run:

```bash
npm run build:android
npm run build:ios
```

This uses `eas.json` and requires credentials configured with Expo.

### Retraining the offline model

Collected gesture samples can be used to update the local fallback model. Run:

```bash
npm run build
node dist/tools/retrainOfflineModel.js <path/to/db.json> dist/offlineModel.json
```

The recognizer will load `dist/offlineModel.json` by default when classifying offline.

### Updating analytics

Run the analytics updater to refresh caregiver stats stored in the database:

```bash
npm run build
node dist/tools/updateAnalytics.js <path/to/db.json>
```

Open the app and tap **Analytics** on the recognition screen to view the dashboard.

---

## 🤝 Contributing

This is a focused project with one user. That means:

- ✅ Clean code, tested assumptions
- ✅ No “move fast” hacks
- ✅ Emotional context matters — build with care

If you’re here to help: thank you.  
PRs are welcome, but **read the spec first**.

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
