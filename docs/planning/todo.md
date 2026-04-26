# Amy's Echo TODO - Active Roadmap

**Last refreshed:** 2026-04-26
**Current mode:** supported-core roadmap + cleanup
**Done archive:** `docs/planning/todo-done.md`

This file is the execution source of truth for active roadmap items. Keep summaries here, keep deep handoff context in `docs/planning/topics/<TOPIC-ID>/topic.md`, and archive completed roadmap items in `docs/planning/todo-done.md`.

## 0. Current Baseline Notes From Recent Commits

These checked bullets summarize the current repo baseline. They are not standalone roadmap tasks to archive individually.

- [x] Supported-core route/screen cleanup is complete: non-core webapp screens and tests were removed, old routes no longer drive primary navigation, and supporting CSS/docs were reduced.
- [x] Backend product surface cleanup is complete enough for the supported core: non-core routes are no longer part of default bootstrap, and training gallery / pretraining route assumptions were removed.
- [x] Python training code now uses the canonical `server/src/amyserver_tools/` path; duplicate `server/training/` code was removed.
- [x] Post-training cadence work (`JUN-P1-6`) is done and archived with service, CLI, route, tests, runbook, and dry-run evidence in `docs/planning/todo-done.md`.
- [x] DGS training quality was hardened with feature-contract validation, bundle ingestion checks, and recognition quality gating.
- [x] Real-device protocol tooling now has a canonical evaluator path in `scripts/evaluate_device_protocol_results.py`.
- [x] DGS planning was clarified with `docs/testing/benchmarks/dgs-realistic-protocol.md` and topic `RD-P1-4`.
- [x] Training UX moved toward the one-upload flow and synchronized per-profile gesture history/navigation.
- [x] Shared webapp utilities were hardened for telemetry, backup, and data protection behavior.
- [x] Demo model artifacts were isolated from generated/runtime artifacts; checksum and test fixture docs were updated.
- [x] Main workflow output-contract coverage was hardened for training trigger parsing, app-state hook branches, training-status route responses, model metadata rejection paths, and bundle-upload profile authorization.

## 1. Blocked Execution Items

Execution order when hardware/data blockers clear: run `APR-P0-2` first, use the resulting device artifacts to decide `APR-P0-1` and `JUL-P1-1`, then refresh the release verdict in `APR-P0-5`.

- [ ] **APR-P0-1:** Complete real-device worker-offload benchmark and publish a `keep` / `iterate` / `reject` decision.
  - Status: Blocked on real-device main-thread vs worker-mode measurements from the APR-P0-2 cycle.
  - Topic board: `docs/planning/topics/APR-P0-1/topic.md`
  - Entry points: `webapp/src/gesture/workers/DetectionWorker.ts`, `webapp/src/gesture/workers/WorkerDetectionBridge.ts`, `docs/testing/benchmarks/worker-offload-2026-03-25.md`

- [ ] **APR-P0-2:** Run the full real-device performance protocol cycle and publish reproducible artifacts.
  - Status: Blocked on P0/P1 caregiver-device artifacts not present in the workspace.
  - Topic board: `docs/planning/topics/APR-P0-2/topic.md`
  - Entry points: `webapp/src/hooks/useSignLanguageDetector.ts`, `webapp/src/components/TrainingRecorder.tsx`, `docs/testing/benchmarks/device-performance-protocol.md`

- [ ] **APR-P0-5:** Refresh the release gate verdict from real-device evidence.
  - Status: Blocked until committed APR-P0-2 real-device artifacts exist.
  - Topic board: `docs/planning/topics/APR-P0-5/topic.md`
  - Evidence target: create a new `docs/testing/benchmarks/results/<date>/apr-p0-4-gate-interpretation.md` snapshot from fresh real-device artifacts and sync `docs/planning/release-0.0.2-readiness.md`.

- [ ] **MAY-P1-3:** Run the few-shot baseline on a current non-fixture training snapshot.
  - Status: Blocked because the workspace has no active non-fixture `training_manifest.json` snapshot to evaluate honestly.
  - Topic board: `docs/planning/topics/MAY-P1-3/topic.md`
  - Entry points: `server/src/amyserver_tools/train_mlp_fewshot.py`, `docs/testing/benchmarks/few-shot-protocol.md`

- [ ] **JUL-P1-1:** Publish long-session hardware baselines for target caregiver devices and compare against release gates.
  - Status: Blocked on target-device hardware access and long-session measurements.
  - Topic board: `docs/planning/topics/JUL-P1-1/topic.md`
  - Evidence target: benchmark table and interpretation under `docs/testing/benchmarks/`.

## 2. R&D Backlog

No active R&D backlog follow-ups at this time.

## 3. Cleanup Follow-Ups

- [ ] **APR-QA-1:** Close the remaining supported-core workflow output-contract gaps flagged by the 2026-04-26 audit.
  - Status: Core branch coverage is improved for webapp training/app-state and server training/model metadata routes, but profile route contracts and some integration fallback assertions still need explicit tests.
  - Remaining gaps to close next: `server/test/profileRoutes.test.ts`, `integration/test/training-flow.test.ts`, `integration/test/multimodal-training-flow.test.ts`, `integration/test/webapp-video-upload.test.ts`, `integration/test/contract-smoke.test.ts`

## 4. Planning Rules

1. Keep `docs/planning/todo.md` as the active roadmap status source.
2. Keep execution detail in `docs/planning/topics/<TOPIC-ID>/topic.md`.
3. Move completed roadmap items to `docs/planning/todo-done.md` by cut/paste; do not delete history.
4. Mark tasks done only when evidence artifacts are committed.
5. Use `docs/planning/topics/_template/topic-template.md` when adding new topic boards.
6. Use lowercase planning paths only; do not recreate legacy uppercase planning filenames.
