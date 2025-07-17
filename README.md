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

## 🛣️ Development Plan

The detailed project roadmap and actionable TODO list can be found in [`docs/TODO.md`](docs/TODO.md).

The original roadmap was written before the project reached a stable state. Now that the foundation is solid, the focus shifts to building intelligence and polish on top of it. The following plan reimagines how the app will evolve over three phases.

### Amy's Echo: Revised Project Roadmap (v2)

#### Phase 1: Implementing Core Intelligence & Accessibility (Current Priority)
*Goal:* Deliver the highest-impact features now that the basics work.

  - **LLM-Powered Dialog Engine:** Implement the remaining TODO in `dialogEngine.ts` to pull live suggestions from a Large Language Model.
  - **German Sign Language (DGS) Video Integration:** Play an optional DGS video for each symbol to support multimodal learning.
  - **Complete Core Services:** Finalize `mlService` for gesture classification and `audioService` for richer non-verbal feedback.

#### Phase 2: Enhancing the Caregiver & Child Experience
*Goal:* Polish the UI and expand training capabilities.

  - **Full UI/UX Polish:** Improve button feedback, refine layouts and ensure a delightful experience.
  - **Gesture Training Module:** Build out `TrainingScreen.tsx` and connect it via the Admin screen so new gestures can be recorded.
  - **User Onboarding Flow:** Re-introduce `OnboardingScreen.tsx` to guide caregivers through setup and consent.

#### Phase 3: Long-Term Growth & Deployment
*Goal:* Prepare the project for real-world use and future improvements.

  - **Parental Analytics Dashboard:** Expand `ParentScreen.tsx` with charts based on the collected analytics tables.
  - **Offline Model Personalization:** Use the stored gesture training data to tailor recognition models for each profile.
  - **Deployment Readiness:** Complete store assets, privacy policies and build configuration for release on iOS and Android.

### Actionable TODO List
This prioritized checklist focuses on finishing Phase&nbsp;1.

- [ ] `dialogEngine.ts`: Replace the placeholder `getLLMSuggestions` with a live LLM API call
- [ ] `LearningScreen.tsx`: Manage `llmSuggestions` and `llmLoading` state to display suggestions
- [ ] `db/schema.ts` & `db/models.ts`: Add a `dgs_video_asset_path: string` field to the `Symbol` table
- [ ] `db/index.ts`: Seed the database with placeholder DGS video paths
- [ ] `SymbolVideoPlayer.tsx`: Accept and play a second (DGS) video source
- [ ] `LearningScreen.tsx`: Provide a toggle to switch between the standard video and the DGS version
- [ ] `mlService.ts`: Implement `loadModels()` and `classifyGesture()` using `react-native-fast-tflite`
- [ ] `audioService.ts`: Implement `playSystemSound()` with `expo-av` to play success and error cues
- [ ] `AdminScreen.tsx`: Add a button to launch `TrainingScreen`
- [ ] `ProfileSelectScreen.tsx`: After profile creation, navigate to `OnboardingScreen`
- [ ] `OnboardingScreen.tsx`: Save consent toggles to the user profile and add a "Continue" button
- [ ] **UI Review:** Begin adding `accessibilityLabel` props to buttons, starting with `SymbolButton.tsx` and `LearningScreen.tsx`

## ▶️ Running the mobile app

The React Native code lives in `app/`. Install dependencies with `npm install` inside that folder, then run `npm run ios` or `npm run android` to start a simulator. This skeleton includes onboarding, recognition, correction and training screens. Camera and ML integration now have an initial hybrid recognizer stub.

DGS demonstration videos can be placed under `app/assets/videos/dgs/`. Each gesture entry may specify a `videoUri` and optional `dgsVideoUri` pointing to these files. A toggle on the recognition screen lets you switch between the standard symbol video and the DGS version when available.

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
