# Amy’s Echo

**This repository contains the development work for my little girl — to help her be understood, to help her learn, and to help others understand her world.**

Amy is four years old. She was born with **22q11 Deletion Syndrome** and communicates using **German Sign Language (DGS)**. Her gestures are expressive, her intent is clear — but most people around her don’t understand what she’s trying to say.

This project aims to fix that.

See [`docs/CodebaseOverview.md`](docs/CodebaseOverview.md) for a summary of the repository structure.

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
2. `cd app` – open the app code
3. `npm install` - install mobile app deps
   - The `app/.npmrc` file enables `legacy-peer-deps` so installs succeed even
     if some libraries lag behind React 19
4. `npm run type-check` – verify the TypeScript build
5. `npm test` – run the Node test suite (uses `ts-node` from devDependencies)
   - Tests live in `app/test/` and cover both server and app modules.
6. `cd ../server && npm install` – install backend dependencies
   - (Python 3 required) Run `pip install -r requirements.txt` to install `numpy` and `pytest` for the training tests.
   - Then run `npm test` inside `server/` to execute the Python suite in `server/test/`.
7. Inside `app`, run `npm run ios` or `npm run android` to launch the app
8. Or run `./scripts/full-check.sh` from the repo root to automatically install
   dependencies and execute all tests at once
9. Or check the expo setup inside `app` via `npx expo install --check` + `npx expo-doctor`

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


## ▶️ Running the mobile app

The React Native code lives in `app/`. Install dependencies with `npm install` inside that folder, then run `npm run ios` or `npm run android` to start a simulator. These scripts use **Expo**'s `run` commands under the hood. This skeleton includes onboarding, recognition, correction and training screens. Camera and ML integration now have an initial hybrid recognizer stub.

DGS demonstration videos can be placed under `app/assets/videos/dgs/`. Each gesture entry may specify a `videoUri` and optional `dgsVideoUri` pointing to these files. A toggle on the recognition screen lets you switch between the standard symbol video and the DGS version when available.
The `DgsVideoPlayer` component loops these videos automatically so Amy can watch each sign repeatedly.

The LLM-powered suggestions require an OpenAI API key. You can set this via the `OPENAI_API_KEY` environment variable, place the key in a local `.openai-key` file, or save it securely using the Admin screen. Never commit keys to the repository.

### Building the custom dev client

If you want to run the app on a physical device with a custom dev client, execute `npx expo prebuild` inside `app/` once to generate the native Android and iOS projects. These directories are not tracked in git to avoid committing large binaries. After the prebuild step you can launch the app with `npm run ios` or `npm run android`.

### Creating production builds

To generate store-ready binaries using EAS Build, run:

```bash
npm run build:android
npm run build:ios
```

This uses `eas.json` and requires credentials configured with Expo.
If you run the build in a CI or other non-interactive environment,
set the `EXPO_TOKEN` environment variable with an Expo access token.
Otherwise the command will fail when it prompts for login.

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

### Running the backend server

The backend provides endpoints for model training.
Start it with:

```bash
npm run build
node dist/server.js
```

Set an `API_TOKEN` environment variable before starting; the server will refuse to run without it.
All requests must include `Authorization: Bearer $API_TOKEN`.

Open the app and tap **Analytics** on the recognition screen to view the dashboard.

### 🐧 Running the mobile app inside WSL2 (with USB debugging)

You can run the Android build locally using a real Android device connected over USB — even when working inside **WSL2**. This is the recommended setup for real-world testing (especially for gesture recognition performance).

#### ✅ Prerequisites

* Windows 11 with [WSL2](https://learn.microsoft.com/en-us/windows/wsl/)
* [`usbipd-win`](https://github.com/dorssel/usbipd-win) installed (`winget install dorssel.usbipd-win`)
* Android device with **USB debugging** enabled
* Expo + React Native CLI environment already set up

#### ⚙️ 1. Install ADB + USB tools inside WSL2

```bash
sudo apt update
sudo apt install android-tools-adb usbutils
```

#### 🔌 2. Attach Android USB device from Windows (PowerShell, as admin)

```powershell
usbipd list
usbipd attach --busid <BUSID> --wsl
```

> Replace `<BUSID>` with your Android device’s BusID from the `usbipd list` output — e.g., `1-3`.

#### 🧪 3. Verify connection inside WSL2

```bash
lsusb
adb devices
```

> If the device shows as `unauthorized`, unlock your phone and **confirm the USB debugging prompt**.

Expected output:

```
List of devices attached
xxxxxxx	device
```

PS: `npx expo start --tunnel` can be used to connect from android to expo in WSL2

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
