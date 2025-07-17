# AGENTS.md - Standard Operating Procedure for Amy's Echo

This document provides a set of guidelines for agents (human or AI) to follow when working on the Amy's Echo codebase. Its purpose is to streamline development, ensure consistency, and provide a clear entry point for any given task.

## 1. Project Mission

Amy's Echo is a multimodal, offline-first communication platform for non-verbal children, especially those with 22q11.2 deletion syndrome. The primary goal is to create an adaptive and intelligent tool that grows with the child.

## 2. Agent Standard Operating Procedure (SOP)

**All agents must follow this procedure for every task.**

1.  **Consult This File First**: Always begin by reading this `AGENTS.md` file to understand the standard workflow.

2.  **Read the Specification**: The primary source of truth for all project requirements and goals is located at:
    > `/spec/AmysEcho.md`

    This file contains the definitive specification. Do not infer requirements from other files if they conflict with the specification.

3.  **Review the Action Plan**: For detailed, actionable tasks that have been pre-planned based on the specification, consult:
    > `docs/TODO.md`

    This file breaks down the high-level goals from the specification into concrete coding tasks with implementation hints.

4.  **Implement Changes**: Locate the relevant files using the directory map below and implement the required changes.

5.  **Validate and Report**: After implementation, review your changes for correctness. When reporting completion, provide a summary and, if applicable, a diff/patch of the changed files.

## 3. Authoritative Document Map

Use this table to understand the purpose of key documents.

| Purpose                                   | File Location         |
| ----------------------------------------- | --------------------- |
| **Definitive Project Specification** | `/spec/AmysEcho.md`   |
| **Detailed Implementation Tasks & Todos** | `docs/TODO.md`        |
| **High-Level Overview & Setup** | `README.md`           |
| **Agent Workflow & Guidelines** | `AGENTS.md` (this file) |

## 4. Key Code Directory Structure

-   `db/`: All database-related files (schema, models, seeding).
-   `screens/`: The main UI screen components (`LearningScreen.tsx`, `AdminScreen.tsx`).
-   `services/`: Business logic and external API clients (`dialogEngine.ts`, `mlService.ts`).
-   `components/`: Reusable UI components used across screens.

## 5. Approved Shell Commands

To avoid syntax errors as seen in previous workflows, use the following correct commands for repository exploration.

* **Find a file by name (repo-wide):**
    ```shell
    find . -name "AGENTS.md"
    ```

* **Find a file within a specific directory (e.g., `spec`):**
    ```shell
    find ./spec -name "AmysEcho.md"
    ```
    *(Note: The `-maxdepth` option, if used, must come before the `-name` option).*

* **List all files recursively:**
    ```shell
    ls -R
    ```
