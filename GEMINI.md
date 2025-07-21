# GEMINI.md - Standard Operating Procedure for Amy's Echo

This document provides a set of guidelines for agents (human or AI) to follow when working on the Amy's Echo codebase. Its purpose is to streamline development, ensure consistency, and provide a clear entry point for any given task.

## 1. Project Mission

Amy's Echo is a multimodal, offline-first communication platform for non-verbal children. The primary goal is to create an adaptive and intelligent tool that grows with the child, as detailed in the project specification. The project is built for a single user, Amy, a four-year-old with 22q11 Deletion Syndrome who uses German Sign Language (DGS).

## 2. Agent Standard Operating Procedure (SOP)

**All agents must follow this procedure for every task.**

1.  **Consult This File First**: Always begin by reading this `GEMINI.md` file to understand the standard workflow.
2.  **Read the Specification**: The primary source of truth for all project requirements and goals is located at:
    > **/spec/AmysEcho.md**

    This file contains the definitive specification. Do not infer requirements from other files if they conflict with the specification.
3.  **Review the Action Plan**: For detailed, actionable tasks that have been pre-planned based on the specification, consult:
    > **docs/TODO.md** and **docs/UnifiedAIImplementationBlueprint.md**

    These files break down the high-level goals from the specification into concrete coding tasks with implementation hints.
4.  **Implement Changes**: Locate the relevant files using the directory map below and implement the required changes.
5.  **Validate and Report**: After implementation, review your changes for correctness. When reporting completion, provide a summary and, if applicable, a diff/patch of the changed files.

## 3. Authoritative Document Map

| Purpose                                   | File Location         |
| ----------------------------------------- | --------------------- |
| **Definitive Project Specification** | `/spec/AmysEcho.md`   |
| **Detailed Implementation Tasks & Todos** | `docs/TODO.md`        |
| **AI Implementation Blueprint** | `docs/UnifiedAIImplementationBlueprint.md` |
| **High-Level Overview & Setup** | `README.md`           |
| **Agent Workflow & Guidelines** | `GEMINI.md` (this file) |

## 4. Key Code Directory Structure

-   `app/`: Contains the React Native mobile application.
-   `app/src/screens`: Main UI screen components.
-   `app/src/services`: Business logic and external API clients.
-   `app/src/components`: Reusable UI components.
-   `app/test/`: Test files for both the mobile app and backend modules.

-   `server/test/`: Python tests for the training pipeline.

-   `server/`: Backend server code.
-   `server/src/services`: Backend service logic.
-   `server/src/tools`: Scripts for tasks like model downloading and retraining.

-   `spec/`: Project specification.
-   `docs/`: Project documentation.

## 5. Tech Stack

| Layer             | Tech                          | Purpose                                           |
|------------------|-------------------------------|---------------------------------------------------|
| App Framework     | React Native (CLI)            | Cross-platform + native module access             |
| Language          | TypeScript (strict mode)      | Predictable, type-safe code                       |
| Camera            | `react-native-vision-camera`  | High-performance gesture capture                  |
| ML Inference      | `react-native-fast-tflite`    | Local fallback via TensorFlow Lite                |
| Cloud ML          | Custom API / OpenAI           | Accurate gesture classification & dialog          |
| UI/UX             | RN Animated API + Skia (opt.) | Gentle, trust-based feedback                      |
| Audio             | `expo-av`, `expo-speech`      | Speech output + sound effects                     |
| Database          | WatermelonDB (SQLite)         | Encrypted, offline-first local storage            |

## 6. Setup and Execution

1. `npm install` – install root dependencies
2. `cd app && npm install` – install mobile app deps
3. `npm test` – run the Node test suite
4. `npm run type-check` – verify the TypeScript build inside `app`
5. Inside `app`, run `npm run ios` or `npm run android` to launch the app
6. Alternatively, run `./scripts/full-check.sh` from the repo root to run all checks at once

### Backend

- Start the server: `npm run build && node dist/server.js`
- Retrain offline model: `npm run build && node dist/tools/retrainOfflineModel.js <path/to/db.json> dist/offlineModel.json`
- Update analytics: `npm run build && node dist/tools/updateAnalytics.js <path/to/db.json>`
