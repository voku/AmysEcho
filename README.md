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
| App Framework | React Native (CLI)            | Cross-platform + native module access  |
| Language      | TypeScript (strict mode)      | Predictable, type-safe code            |
| ML Engine     | MediaPipe + Amy's Echo MLP    | Real-time gesture recognition & personalization |
| LLM Engine    | On-device caregiver prompt engine | Contextual caregiver prompts and reassurance |
| Camera        | `react-native-webview`        | In-app camera feed & landmark detection |
| Backend API   | Node/Express server           | Sample upload, training, model serving |
| UI/UX         | RN Animated API + Skia (opt.) | Gentle, trust-based feedback           |
| Audio         | `expo-audio`, `expo-speech`   | Speech output + sound effects          |
| Video         | `expo-video`                  | Video output                           |
| Database      | WatermelonDB (SQLite)         | Encrypted local storage (sync-enabled) |

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

```bash
npm ci --prefix app
npm ci --prefix server
pip install -r server/requirements.txt
npm ci --prefix integration

npm run type-check --prefix app
npm test --prefix app
npm run type-check --prefix server
npm test --prefix server
npm test --prefix integration

npm run build --prefix server
```

Commands use `--prefix` and should be run from the repository root.

Run notes

- Server:
   - MediaPipe assets load via CDN; no manual model download is required.
   - Build + start: npm run build --prefix server && ./scripts/server-start.sh
- App:
   - Android emulator:
   - `EXPO_PUBLIC_API_URL=http://10.0.2.2:5000 scripts/dev-run.sh --android`
   - or `scripts/adb-reverse.sh 5000 && scripts/dev-run.sh --android`
- Uses demo-token by default for auth.

How to use it

- Start server (required for training + model serving):
   - npm run build --prefix server && ./scripts/server-start.sh
- Run app:
   - Android emulator: EXPO_PUBLIC_API_URL=http://10.0.2.2:5000 scripts/dev-run.sh --android
   - Or scripts/adb-reverse.sh 5000 && scripts/dev-run.sh --android
- Workflow:
   - Use Training screen to record a few samples for key DGS gestures (per child).
   - Use Recognition screen; when it’s wrong, correct it; the app uploads the sample for that child.
  - Recognition runs locally; as training samples accumulate, personalized MLP weights improve confidence.

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
- **Reliable by default (hybrid)**: Gestures are classified on-device using cached MLP weights, while the server handles sample uploads, training, and model distribution.
- **Handle uncertainty with grace, not silence**
- **Log every correction to learn and adapt**
- **Personalize models per child profile** so caregivers can train and deploy custom gestures for each 22q11 child
- **Make it simple for a child to succeed**

---

## Project Status

All major features for Phase 1, 2 and 3 have been implemented. The project is now in the optimization and production readiness phase. Development tasks are tracked in [`docs/TODO.md`](docs/TODO.md), which now serves as a living document for ongoing improvements and bug fixes.

The repository now focuses on the core gesture recognition loop: recording high-quality samples, uploading them to the server, training personalized models, and serving those models back to the mobile client. Auxiliary caregiver portals, analytics dashboards, and dialog services have been removed so local development only requires the upload, training, and model-serving endpoints exposed by the Node server.

## ▶️ Running the mobile app

The React Native code lives in `app/`. Install dependencies with `npm install` inside that folder, then run `npm run ios` or `npm run android` to start a simulator. These scripts use **Expo**'s `run` commands under the hood. This skeleton includes onboarding, recognition, correction and streamlined training screens dedicated to recording samples. Camera and ML integration now have an initial hybrid recognizer stub.

DGS demonstration videos can be placed under `app/assets/videos/dgs/`. Each gesture entry may specify a `videoUri` and optional `dgsVideoUri` pointing to these files. A toggle on the recognition screen lets you switch between the standard symbol video and the DGS version when available. The `DgsVideoPlayer` component loops these videos automatically so Amy can watch each sign repeatedly.

### Configuring the backend API token

The training endpoints require a bearer token. Choose **one** of the following options for local development:

1. **Environment variable (recommended for development/CI)**
   ```bash
   export EXPO_PUBLIC_API_TOKEN="demo-token"
   npm start --prefix server
   ```
   Expo, Jest, and the Node server all reuse the token exposed through this variable.

2. **`.env.local` file** – Create `app/.env.local` with `EXPO_PUBLIC_API_TOKEN=demo-token`. The Expo CLI loads it automatically during `npm run ios`/`android`.

3. **Admin screen input** – Launch the Admin screen in the mobile app and paste the token once. It is written to `SecureStore` so the device can stay offline between sessions.

Never commit real tokens to the repository or logs. Production deployments should fetch the secret from the hosting platform's secret manager.

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
npm run build --prefix server
./scripts/server-start.sh
```

- Uses `PORT=5000` and `API_TOKEN=demo-token` by default.
- Stores the latest MLP model at `server/data/models/global/amy_model.npz` once training completes.

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

4) Install/launch on Android (Terminal D)

```
cd app && expo run:android
```

5) Verify connectivity

- Server logs show requests to `/latest-mlp-model` and `/api/*`.
- App logs should not show “Network request failed”.

---

## 🤝 Contributing

This is a focused project with one user. That means:

- ✅ Clean code, tested assumptions
- ✅ No “move fast” hacks
- ✅ Emotional context matters — build with care

If you’re here to help: thank you.
PRs are welcome, but **read the [spec](spec/AmysEcho.md)** and the contributor guides in `AGENTS.md`, `app/AGENTS.md`, and `server/AGENTS.md` first.

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
