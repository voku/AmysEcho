# AGENTS.md Consistency Audit

## Executive Summary
- Overall consistency: **Moderate-High**
- Number of real defects detected: **2**
- Number of context-dependent rules: **3**
- Number of valid instructions reviewed: **18**

## Confirmed Valid Instructions
Notable instructions that are internally coherent and operationally useful:

- Discovery-first workflow (`Discovery → Planning → Implementation → Verification`) is clear and enforceable for coding tasks.
- Identity boundary rules (account vs. profile) are specific and reduce common integration mistakes.
- Testing integrity constraints (do not skip tests, keep tests passing) are standard quality controls.
- Language rule for user-facing app text in German is scoped to user-visible content and allows English for developer-facing logs.
- LLM-oriented guidance on avoiding unnecessary wrappers around standard APIs is internally consistent as a preference set.
- Shell guidance (`rg` preferred, avoid recursive `ls -R`) is executable and not conflicting.

## Context-Dependent Rules

### 1) Full-suite verification by default
- **Instruction quote:** "Run the full test suite - all tests must pass" and the full command block under "Commands to Run from Repository Root." 
- **Why it might appear problematic:** Running all webapp/server/integration checks can be expensive for small or docs-only changes.
- **Why it may still be valid:** In a safety-critical communication platform, strict regression control may be a deliberate project policy.

### 2) "Every line of code must enhance Amy's ability to communicate"
- **Instruction quote:** "Every line of code must enhance Amy's ability to communicate."
- **Why it might appear problematic:** Infra/refactor/security work may not directly map to immediate communication outcomes.
- **Why it may still be valid:** As a mission statement, it can legitimately steer priorities and trade-offs.

### 3) Strong anti-abstraction preference
- **Instruction quote:** "Prefer Standard Library APIs Over Custom Abstractions" and "Don't create wrapper functions around standard APIs."
- **Why it might appear problematic:** Some teams intentionally centralize wrappers for portability/instrumentation.
- **Why it may still be valid:** This repository explicitly optimizes for LLM-editability, so this preference can be rational for local goals.

## Defects

### Contradictions
None confirmed.

### Conditional Conflicts
None confirmed.

### Ambiguities

#### Ambiguity 1: Scope trigger for server-specific rules
- **Instruction quote:** "For guidelines specific to the server, see the `AGENTS.md` file within the `server/` directory."
- **Related rule (missing operational clause):** No explicit statement of when those rules become mandatory (e.g., only for files under `server/`, or any server-related task).
- **Failure scenario:** An agent updates `docs/` about server behavior and is unsure whether it must apply `server/AGENTS.md` constraints, leading to inconsistent handling across agents.
- **Why this cannot be resolved reliably without guessing:** The phrase "specific to the server" is conceptual rather than path-scoped, and no precedence/scope model is defined in-file.
- **Minimal fix:** Add one sentence: "The `server/AGENTS.md` rules are mandatory only for files under `server/` (and its subdirectories), unless explicitly referenced by task instructions."

### Redundancies
None confirmed as harmful.

### Non-Testable Requirements

#### Non-testable 1: Absolute impact requirement
- **Instruction quote:** "Every line of code must enhance Amy's ability to communicate."
- **Related rule (if applicable):** N/A (standalone absolute requirement).
- **Failure scenario:** Two reviewers can reasonably disagree whether a dependency upgrade or refactor "enhances communication"; compliance cannot be objectively checked.
- **Why this cannot be resolved reliably without guessing:** No measurable acceptance criteria are provided for what counts as "enhance" across maintenance tasks.
- **Minimal fix:** Rephrase as testable policy: "All changes must either (a) directly improve communication UX/functionality, or (b) improve reliability, safety, performance, or maintainability of communication features."

### Feasibility Issues
None confirmed.

### Safety / Quality Risks
None confirmed.

### Workflow / Format Collisions
None confirmed.

## Governance / Priority Model
This AGENTS.md does **not** define an explicit conflict-resolution precedence model. It provides many strong directives but no in-file order for resolving clashes (e.g., mission statements vs. concrete workflow steps vs. subdirectory-specific instructions).

Recommended improvement: add a compact "Rule Priority" section that states precedence explicitly (safety and external system constraints first, then task-specific user instructions, then project workflow, then style preferences).

## Minimal Rewrite Recommendations
1. Add explicit scope binding for referenced nested AGENTS files (especially `server/AGENTS.md`).
2. Convert the absolute "every line" mission statement into a measurable two-path compliance rule (direct feature impact **or** enabling reliability/maintainability improvements).
3. Add a short precedence ladder for conflict resolution.

## Suggested Rule Priority
When rules conflict, agents should follow:

1. **Safety and correctness constraints** (no unsafe fabrication, no destructive or unverifiable behavior)
2. **System/developer runtime constraints** (tooling, environment, execution restrictions)
3. **Direct user task instructions**
4. **Directory-scoped AGENTS rules** (root, then deeper nested files)
5. **Project workflow requirements** (discovery/planning/testing/documentation)
6. **Style and preference guidance** (naming, abstraction preferences, formatting suggestions)
