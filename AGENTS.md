# AGENTS.md - Standard Operating Procedure for Amy's Echo

This document provides a set of guidelines for agents (human or AI) to follow when working on the Amy's Echo codebase. Its purpose is to streamline development, ensure consistency, and provide a clear entry point for any given task.

## 1. Project Mission

Amy's Echo is a multimodal, offline-first communication platform for non-verbal children. The primary goal is to create an adaptive and intelligent tool that grows with the child, as detailed in the project specification.

## 2. Agent Standard Operating Procedure (SOP)

**All agents must follow this procedure for every task.**

1.  **Consult This File First**: Always begin by reading this `AGENTS.md` file to understand the standard workflow.
2.  **Read the Specification**: The primary source of truth for all project requirements and goals is located at:
    > **/spec/AmysEcho.md**

    This file contains the definitive specification. Do not infer requirements from other files if they conflict with the specification.
3.  **Review the Action Plan**: For detailed, actionable tasks that have been pre-planned based on the specification, consult:
    > **docs/TODO.md**

    This file breaks down the high-level goals from the specification into concrete coding tasks with implementation hints.
4.  **Implement Changes**: Locate the relevant files using the directory map below and implement the required changes.
5.  **Validate and Report**: After implementation, review your changes for correctness. When reporting completion, provide a summary and, if applicable, a diff/patch of the changed files.

6.  **Run Tests and Type Checks**: Before submitting a pull request, run the following commands:
    ```bash
    npm run type-check --prefix app
    npm test --prefix app
    pip install -r server/requirements.txt
    npm test --prefix server
    ```
    You can also execute `./scripts/full-check.sh` from the repo root to run all of the above in one step.

## 3. Authoritative Document Map

| Purpose                                   | File Location         |
| ----------------------------------------- | --------------------- |
| **Definitive Project Specification** | `/spec/AmysEcho.md`   |
| **Detailed Implementation Tasks & Todos** | `docs/TODO.md`        |
| **High-Level Overview & Setup** | `README.md`           |
| **Agent Workflow & Guidelines** | `AGENTS.md` (this file) |

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

## 5. Approved Shell Commands

To avoid syntax errors, use the following correct commands for repository exploration.

* **Find a file by name (repo-wide):**
    ```shell
    find . -name "AmysEcho.md"
    ```
* **List all files recursively:**
    ```shell
    ls -R
    ```
