# Amy's Echo TODO — 4-Month Delivery Plan (Apr–Jul 2026)

**Last refreshed:** 2026-04-06 (updated)
**Scope:** next ~4 months of execution, aligned to current codebase state and the project prime directive from `spec/AmysEcho.md`.
**Done archive:** completed roadmap items now live in `docs/planning/todo-done.md`.

## Topic board structure (Kanban-style)

To keep planned topics visible and traceable, every active TODO has a dedicated topic board in `docs/planning/topics/<TOPIC-ID>/topic.md`.

- **Status columns:** `Backlog`, `Ready`, `In Progress`, `Blocked`, `Done`
- **Template for new topics:** `docs/planning/topics/_template/topic-template.md`
- **Topic index:** `docs/planning/topics/readme.md`

When you add a new TODO entry in this file, create its topic board directory immediately and link it from the TODO line.

## 0) Current baseline (already implemented)

- Profile-aware model delivery with global fallback.
- Persistent cached model fallback in webapp.
- Artifact contract checks (feature mode + label count).
- Adaptive camera policy.
- Worker-offload prototype exists; production decision still pending.
- Documentation link integrity validated (see `docs/planning/docs-validation-report-2026-03-27.md`).

---

## 1) April 2026 — Performance truth and production gate definition

### Goal
Close the last evidence gap between prototype performance and release confidence on real caregiver devices.

### Execution order

1. Run `APR-P0-2` first to generate the canonical real-device artefact set across the required P0 matrix.
2. Use the same device cycle to close `APR-P0-1`, because worker-offload comparison is explicitly part of the sustained-session protocol.
3. Recompute the release verdict in `APR-P0-5` immediately after the artefacts land so release readiness no longer depends on CI-only evidence.

### Planned deliverables

- [ ] **APR-P0-2:** Run full real-device performance protocol cycle and publish reproducible artifacts.
  - Topic board: `docs/planning/topics/APR-P0-2/topic.md` (details + evidence; status authority: `docs/planning/todo.md`).
  - Entry points: `webapp/src/hooks/useSignLanguageDetector.ts`, `webapp/src/components/TrainingRecorder.tsx`, `docs/testing/benchmarks/device-performance-protocol.md`
  - Evidence: result artefacts under `docs/testing/benchmarks/results/<date>/` following protocol structure, with at least the required P0 devices committed and interpretable for G1-G4 release gates.

- [ ] **APR-P0-1:** Complete real-device worker-offload benchmark and publish decision (`keep` / `iterate` / `reject`).
  - Topic board: `docs/planning/topics/APR-P0-1/topic.md` (details + evidence; status authority: `docs/planning/todo.md`).
  - Sequencing: run inside the same real-device measurement cycle as `APR-P0-2`; compare main-thread vs worker mode on the sustained-session scenario instead of creating a separate benchmark track.
  - Entry points: `webapp/src/gesture/workers/DetectionWorker.ts`, `webapp/src/gesture/workers/WorkerDetectionBridge.ts`, `docs/testing/benchmarks/worker-offload-2026-03-25.md`, `docs/testing/benchmarks/device-performance-protocol.md`
  - Evidence: benchmark update with real device matrix + final recommendation and risk notes, tied to the `APR-P0-2` artefact set.

- [ ] **APR-P0-5:** Recompute release gate verdict from real-device evidence and update readiness documents.
  - Topic board: `docs/planning/topics/APR-P0-5/topic.md` (details + evidence; status authority: `docs/planning/todo.md`).
  - Sequencing: starts only after `APR-P0-2` artefacts are committed and `APR-P0-1` worker-mode recommendation is recorded.
  - Entry points: `docs/testing/benchmarks/results/2026-04-03/apr-p0-4-gate-interpretation.md`, `docs/planning/release-0.0.2-readiness.md`, `docs/testing/benchmarks/device-performance-protocol.md`
  - Evidence: updated gate interpretation with per-device G1-G4 verdicts, fleet verdict (`GO` / `CONDITIONAL GO` / `NO-GO`), and synced readiness status in `docs/planning/release-0.0.2-readiness.md`.

---

## 2) May 2026 — Few-shot quality gates + metadata integrity

### Goal
Move few-shot from ad-hoc analysis to enforceable, signer-safe, production-quality evaluation.

### Planned deliverables
 
- [ ] **MAY-P1-3:** Run the default few-shot runner on a current non-fixture training snapshot and publish a signer-safe quality baseline.
  - Topic board: `docs/planning/topics/MAY-P1-3/topic.md` (details + evidence; status authority: `docs/planning/todo.md`).
  - Sequencing: starts after `APR-P0-2` / `APR-P0-1` / `APR-P0-5` so the active P0 evidence gate remains the primary execution track.
  - Entry points: `server/src/amyserver_tools/train_mlp_fewshot.py`, `docs/testing/benchmarks/few-shot-protocol.md`, `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/`
  - Evidence: committed runner output on a current dataset snapshot including `split_manifest`, `summary.json`, `summary.md`, and a short interpretation note covering known-signer vs new-signer behaviour.

---

## 3) June 2026 — Operational continuity and governance cadence

### Goal
Prevent regression by turning one-time hardening work into repeatable operational cadence.

### Planned deliverables

---

## 4) July 2026 — Release readiness for next milestone

### Goal
Package measured reliability improvements into a clear release gate for Amy-facing production confidence.

### Planned deliverables

- [ ] **JUL-P1-1:** Publish long-session hardware baselines (FPS/thermal/battery deltas) for target caregiver devices and compare against release gates.
  - Topic board: `docs/planning/topics/JUL-P1-1/topic.md` (details + evidence; status authority: `docs/planning/todo.md`).
  - Sequencing: reuse the `APR-P0-2` device matrix, instrumentation, and result format rather than inventing a separate benchmark path.
  - Evidence: benchmark table + threshold pass/fail statement in `docs/testing/benchmarks/`.

---

## 5) MediaPipe + Sign-Language R&D watchlist (capacity-limited)

### Goal
Convert best-practice opportunities into practical improvements without losing delivery focus.

### Active policy
- Keep at most **2 active R&D P0 topics** in progress at the same time.
- Prioritize signer-safety and runtime stability before exploratory model complexity.

### Planned deliverables (pull into Apr–Jul execution as capacity allows)

Execution priority after open P0 closure: `RD-P0-1` -> `RD-P0-2` -> `RD-P1-2`.

- [ ] **RD-P0-1:** Run an A/B benchmark for `ImageProcessingOptions` + ROI handling to reduce landmark jitter and crop failures.
  - Topic board: `docs/planning/topics/RD-P0-1/topic.md` (details + evidence; status authority: `docs/planning/todo.md`).
  - Why now: MediaPipe added stronger ROI validation and broader task-level image processing support in recent releases.
  - Entry points: `webapp/src/gesture/core/GestureDetector.ts`, `webapp/src/hooks/useSignLanguageDetector.ts`, `docs/testing/benchmarks/`
  - Evidence: benchmark artifact comparing baseline vs tuned ROI/crop settings (FPS, drop rate, confidence stability).

- [ ] **RD-P0-2:** Evaluate `FULL_RANGE` face detector mode impact on sign recognition robustness in non-frontal caregiver/device setups.
  - Topic board: `docs/planning/topics/RD-P0-2/topic.md` (details + evidence; status authority: `docs/planning/todo.md`).
  - Why now: full-range face detection support/tests landed in newer MediaPipe tasks; facial context is relevant for multimodal sign interpretation.
  - Entry points: `webapp/src/gesture/`, `integration/test/`, `docs/testing/benchmarks/`
  - Evidence: side-angle/partial-face benchmark matrix and recommendation (`enable` / `keep default`).

- [ ] **RD-P1-2:** Prototype temporal smoothing/sequence modeling upgrade path (beyond per-frame classification) with strict latency budget.
  - Topic board: `docs/planning/topics/RD-P1-2/topic.md` (details + evidence; status authority: `docs/planning/todo.md`).
  - Why now: temporal context is high-value for sign disambiguation.
  - Entry points: `webapp/src/gesture/core/ProcessingSteps.ts`, `server/training/sliding_window.py`, `docs/testing/benchmarks/`
  - Evidence: prototype comparison report (accuracy deltas + p95 latency + battery/thermal impact).

---

## 6) Rules for contributors/LLMs

Planning hygiene note: outdated-doc decisions are logged in `docs/planning/outdated-docs-audit-2026-03-27.md`.

Topic-board governance decision: `docs/planning/topic-board-blind-spot-analysis-2026-04-02.md`.

1. This file is the execution source of truth for non-completed roadmap items.
2. Move completed tasks to `docs/planning/todo-done.md` by cut/paste; do not delete history.
3. Mark tasks done only when evidence artifacts are committed.
4. If code reality diverges, update this plan first, then execute.
5. Verify every listed entry point still exists before starting work; fix the roadmap immediately if a path has moved.
6. Start each task by writing down one concrete first command in the PR/report so the next LLM can resume without rediscovery.

## 7) Quick template for new TODO topics

Use this snippet when adding a new planned deliverable:

```md
- [ ] **<MONTH-CODE>:** <short outcome statement>.
  - Topic board: `docs/planning/topics/<MONTH-CODE>/topic.md` (details + evidence).
  - Status authority: `docs/planning/todo.md`
  - Entry points: `<path1>`, `<path2>`
  - Evidence: `<artifact path and success criteria>`
```

Then copy `docs/planning/topics/_template/topic-template.md` into `docs/planning/topics/<MONTH-CODE>/topic.md` and fill it out.
