# Amy’s Echo

**This repository contains the development work for my little girl — to help her be understood, to help her learn, and to help others understand her world.**

Amy is four years old. She was born with **22q11 Deletion Syndrome** and communicates using **German Sign Language (DGS)**. Her gestures are expressive, her intent is clear — but most people around her don’t understand what she’s trying to say.

This project turns those gestures into speech and symbols so she can be heard anywhere.

---

## 📚 Documentation

- [Codebase overview](docs/CodebaseOverview.md)
- [User stories](docs/UserStories.md)
- [Build & test instructions](docs/BUILD_AND_TEST.md)
- [Project roadmap](docs/TODO.md)
- [Project milestones](docs/ProjectMilestones.md)

---

## 🚀 Quick Start

```bash
npm install
npm run type-check --prefix app
npm test --prefix app
pip install -r server/requirements.txt
npm test --prefix server
npm test --prefix integration
npm run build --prefix server
node server/dist/tools/downloadModels.js
```

Run `npm run ios --prefix app` or `npm run android --prefix app` to launch the mobile app.

See [docs/BUILD_AND_TEST.md](docs/BUILD_AND_TEST.md) for full details.

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

