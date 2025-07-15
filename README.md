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

## 🛣️ Roadmap

The next stages follow the broad implementation plan in the project spec.

- **Phase 1 – Solidify the Foundation**
  - [x] Integrate placeholder symbol images, videos and a basic gestures model
  - [x] Finish `mlService` and `audioService` implementations
  - [x] Expand profile management and vocabulary set selection
  - [x] Build the app with the custom dev client on a device
- **Phase 2 – Enhance Core Functionality**
  - [x] Complete the gesture training workflow and store samples
  - [x] Surface adaptive suggestions from the dialog engine
  - [x] Add caregiver override actions in the CorrectionPanel
- **Phase 3 – Refine and Polish**
  - [x] Improve UI layout and feedback animations
  - [x] Implement accessibility options like larger fonts and high contrast
  - [ ] Support optional DGS video playback for symbols
- **Phase 4 – Advanced Features & Deployment**
  - [ ] Connect to an LLM for dynamic suggestions with privacy controls
  - [ ] Explore offline model retraining from collected data
  - [ ] Build the caregiver analytics dashboard
  - [ ] Prepare production builds for app store release

## ▶️ Running the mobile app

The React Native code lives in `app/`. Install dependencies with `npm install` inside that folder, then run `npm run ios` or `npm run android` to start a simulator. This skeleton includes onboarding, recognition, correction and training screens. Camera and ML integration now have an initial hybrid recognizer stub.

### Building the custom dev client

If you want to run the app on a physical device with a custom dev client, execute `npx expo prebuild` inside `app/` once to generate the native projects. Afterwards use `npm run ios` or `npm run android` to install the dev client on your device.

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
