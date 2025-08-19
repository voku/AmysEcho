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
| Database      | WatermelonDB (SQLite)         | Encrypted local storage (sync-enabled) |

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

Run notes

- Server:
   - Optional (once): npm run download-gesture-task --prefix server (requires network)
   - Build + start: npm run build --prefix server && ./scripts/server-start.sh
- App:
   - Android emulator:
   - `EXPO_PUBLIC_API_URL=http://10.0.2.2:5000 scripts/dev-run.sh --android`
   - or `scripts/adb-reverse.sh 5000 && scripts/dev-run.sh --android`
- Uses demo-token by default for auth.

How to use it

- Start server:
   - Optional once: npm run download-gesture-task --prefix server (for Tasks recognizer; requires
     network)
   - npm run build --prefix server && ./scripts/server-start.sh
   - Health: curl http://localhost:5000/health/recognizer
- Run app:
   - Android emulator: EXPO_PUBLIC_API_URL=http://10.0.2.2:5000 scripts/dev-run.sh --android
   - Or scripts/adb-reverse.sh 5000 && scripts/dev-run.sh --android
- Workflow:
   - Use Training screen to record a few samples for key DGS gestures (per child).
   - Use Recognition screen; when it’s wrong, correct it; the app uploads the sample for that child.
   - Recognition will start using the child’s dataset to generate dgs_label with rising confidence as
     samples grow.

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
- **Reliable by default (hybrid)**: The app uses a server-side detection/recognition path for stability and accuracy, and falls back to on-device when offline.
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

## ▶️ Running the mobile app

The React Native code lives in `app/`. Install dependencies with `npm install` inside that folder, then run `npm run ios` or `npm run android` to start a simulator. These scripts use **Expo**'s `run` commands under the hood. This skeleton includes onboarding, recognition, correction and training screens. Camera and ML integration now have an initial hybrid recognizer stub.

DGS demonstration videos can be placed under `app/assets/videos/dgs/`. Each gesture entry may specify a `videoUri` and optional `dgsVideoUri` pointing to these files. A toggle on the recognition screen lets you switch between the standard symbol video and the DGS version when available. The `DgsVideoPlayer` component loops these videos automatically so Amy can watch each sign repeatedly.

The LLM-powered suggestions require an OpenAI API key. You can set this via the `OPENAI_API_KEY` environment variable, place the key in a local `.openai-key` file, or save it securely using the Admin screen. Never commit keys to the repository.

### Building the custom dev client

If you want to run the app on a physical device with a custom dev client, execute `npx expo prebuild` and `npx expo run:android` inside `app/` once to generate the native Android and iOS projects. These directories are not tracked in git to avoid committing large binaries. After the prebuild step you can launch the app with `npm run ios` or `npm run android`.

### Creating test builds (APK)

Before running any EAS build make sure you're logged in and the project passes Expo checks:

```bash
npx expo whoami             # run `npx expo login` if this fails
(cd app && npx expo install --check)
(cd app && npx expo-doctor) # requires network access
```

Set `CI=1` when building from a non-interactive terminal to disable progress spinners.

#### Custom dev client

To produce a debuggable APK for testers, trigger a development build via EAS:

```bash
CI=1 npm run build:android-dev
```

The CLI prints a link to the artifact. You can also download the most recent build later:

```bash
eas build:download --platform android --profile development --latest
```

This APK only contains the Expo dev client. After installing it on a device you must start the bundler with `npx expo start` to load the JavaScript bundle.

#### Self-contained APK

For an installable APK that bundles the app and runs without the bundler:

```bash
CI=1 npm run build:android-apk
```

The resulting artifact includes the compiled JavaScript and assets, making it suitable for offline testing and sideloading.

### Creating production builds

To generate store-ready binaries using EAS Build, run:

```bash
CI=1 npm run build:android
CI=1 npm run build:ios
```

This uses `eas.json` and requires credentials configured with Expo. If you run the build in a CI or other non-interactive environment, set the `EXPO_TOKEN` environment variable with an Expo access token. Otherwise the command will fail when it prompts for login.

### Build & Test Workflow (EAS)

1. **Run the full test suite** before building:

   ```bash
   npm run type-check --prefix app
   npm test --prefix app
   pip install -r server/requirements.txt
npm test --prefix server
```

   You can also execute `./scripts/full-check.sh` from the repo root to run all checks at once, including Expo dependency checks.

For more detailed build and testing instructions, see [docs/BUILD_AND_TEST.md](docs/BUILD_AND_TEST.md).

---

## 🔗 Local Dev: App + Server (End‑to‑End)

Start the backend server and connect the mobile app to it during development.

1) Start the server (Terminal A)

```
# Optional (once): download MediaPipe Tasks gesture model (requires network)
# npm run download-gesture-task --prefix server

npm run build --prefix server
./scripts/server-start.sh
```

- Uses `PORT=5000` and `API_TOKEN=demo-token` by default.
- Seeds `server/trained_model.tflite` from `app/assets/models/gesture_classifier.tflite` so `/latest-model` works immediately.

2) Reverse port for USB device (Terminal B)

```
./scripts/adb-reverse.sh 5000
```

- Allows the app on a USB‑connected device to reach `http://localhost:5000`.
- Alternatively, skip reverse and set a LAN URL before starting Metro:

```
export EXPO_PUBLIC_API_URL=http://<HOST_LAN_IP>:5000
export EXPO_PUBLIC_API_TOKEN=demo-token
```

3) Start Metro with Expo dev client (Terminal C)

```
./scripts/dev-run.sh --clear --host lan
```

- Defaults expose `EXPO_PUBLIC_API_URL=http://localhost:5000` and token for the app.
 - Ensure the native frame processor plugin is compiled into your dev client:
   - vision-camera-resize-plugin is required for RGB resize. After installing dependencies or updating native modules, rebuild the dev client:
   - `cd app && expo run:android`

4) Install/launch on Android (Terminal D)

```
cd app && expo run:android
```

5) Verify connectivity

- Server logs show requests to `/model-version`, `/latest-model`, and `/api/*`.
- App logs should not show “Network request failed”.

6) Model download 404 fix

- If the app logs `Failed to download model: 404`, ensure `server/trained_model.tflite` exists.
- The server start script seeds it from the app asset; if you removed it, add any `.tflite` at `server/trained_model.tflite` or retrain via `/train-model` + `/train-status/:id`.

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
