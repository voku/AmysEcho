# Amy's Echo TODO — 4-Month Delivery Plan (Apr–Jul 2026)

**Last refreshed:** 2026-03-27
**Scope:** next ~4 months of execution, aligned to current codebase state and external best-practice review.

## 0) Current baseline (already implemented)

- Profile-aware model delivery with global fallback.
- Persistent cached model fallback in webapp.
- Artifact contract checks (feature mode + label count).
- Adaptive camera policy.
- Worker-offload prototype exists; production decision still pending.
- Documentation link integrity validated (see `docs/planning/DOCS_VALIDATION_REPORT_2026-03-27.md`).

---

## 1) April 2026 — Performance truth + reproducibility foundation

### Goal
Lock down measurement discipline so model/runtime decisions are evidence-driven, not intuition-driven.

### Planned deliverables

- [ ] **APR-P0-1:** Run real-device worker-offload benchmark and publish decision (`keep` / `iterate` / `reject`).
  - Entry points: `webapp/src/gesture/core/DetectionWorker.ts`, `webapp/src/gesture/core/WorkerDetectionBridge.ts`, `docs/testing/benchmarks/worker_offload_2026-03-25.md`
  - Evidence: updated benchmark doc with device matrix (low-end tablet, mid-range phone, laptop).

- [ ] **APR-P0-2:** Publish realistic device performance protocol report (first launch, route switch, camera flip, 20-min run).
  - Entry points: `webapp/src/hooks/useSignLanguageDetector.ts`, `webapp/src/components/TrainingRecorder.tsx`
  - Evidence: new dated report in `docs/testing/benchmarks/` with startup/FPS/p95/thermal/battery.

- [ ] **APR-P0-3:** Create reproducible few-shot protocol doc with leakage-safe split contract.
  - Entry points: `server/src/amyserver_tools/train_mlp.py`, `server/training/`, `docs/testing/benchmarks/`
  - Evidence: `docs/testing/benchmarks/few_shot_protocol.md` including seeds, commit SHA, dataset snapshot, split-manifest requirements.

---

## 2) May 2026 — Few-shot automation + data quality contracts

### Goal
Turn few-shot evaluation from ad-hoc effort into repeatable tooling.

### Planned deliverables

- [ ] **MAY-P0-1:** Implement `train_mlp_fewshot.py` runner (profile × shot × seed execution).
  - Entry points: `server/src/amyserver_tools/train_mlp.py`, `server/src/amyserver_tools/train_mlp_sweep.py`
  - Evidence: runner script committed + generated artifacts under `docs/testing/benchmarks/results/<date>/`.

- [ ] **MAY-P0-2:** Add few-shot parser/aggregation tests and strict schema checks.
  - Entry points: `server/test/`, `server/src/amyserver_tools/`
  - Evidence: new tests (`server/test/*fewshot*`) passing for mean/std aggregation and invalid-metric failures.

- [ ] **MAY-P1-1:** Define capture metadata protocol (signer/device/camera/lighting) and enforce persistence through upload/ingestion.
  - Entry points: `webapp/src/training/trainingBundle.ts`, `server/src/routes/trainingBundleRoute.ts`, `docs/training/LANDMARK_STREAM_SCHEMA.md`
  - Evidence: schema update + tests proving metadata survives end-to-end.

---

## 3) June 2026 — Operations hardening + accessibility cadence

### Goal
Reduce operational risk before next release cycle.

### Planned deliverables

- [ ] **JUN-P1-1:** Expand operations runbook with at least one incident drill and rollback evidence.
  - Entry points: `docs/operations/`, `docs/planning/RELEASE_0.0.2_READINESS.md`
  - Evidence: drill report in `docs/operations/` with timeline, detection, mitigation, rollback, postmortem.

- [ ] **JUN-P1-2:** Establish recurring manual accessibility verification cadence (screen reader + keyboard + reduced motion) and run first cycle.
  - Entry points: `docs/testing/TESTING_STRATEGY.md`, `docs/testing/REAL_WORLD_VALIDATION_GUIDE.md`
  - Evidence: cadence doc + first completed cycle artifact in `docs/testing/`.

- [ ] **JUN-P1-3:** Establish terminology quality gate for sign-language wording (“Gebärde”) across user-visible copy.
  - Entry points: `docs/guides/TERMINOLOGY_COMPATIBILITY_CHECKLIST.md`, `webapp/src`, `server/src/routes`
  - Evidence: script/check documented and wired into CI or pre-merge docs workflow.

---

## 4) July 2026 — Release readiness for next milestone

### Goal
Package performance, reliability, and governance improvements into a release-ready quality gate.

### Planned deliverables

- [ ] **JUL-P1-1:** Publish long-session hardware baselines (FPS/thermal/battery deltas) for target caregiver devices.
  - Evidence: benchmark table in `docs/testing/benchmarks/`.

- [ ] **JUL-P1-2:** Production health monitoring ownership + thresholds documented.
  - Evidence: ownership matrix and alert thresholds in `docs/operations/`.

- [ ] **JUL-P2-1:** Break Metacom sentence-composition roadmap into implementation slices with acceptance criteria.
  - Entry points: `docs/metacom/METACOM_SENTENCE_COMPOSITION.md`
  - Evidence: updated roadmap with milestone checkpoints.

- [ ] **JUL-P2-2:** Governance cadence doc (monthly security + quarterly accessibility) with owners and evidence template.
  - Evidence: governance doc in `docs/security/` and/or `docs/testing/`.

---

## 5) Rules for contributors/LLMs

Planning hygiene note: outdated-doc decisions are logged in `docs/planning/OUTDATED_DOCS_AUDIT_2026-03-27.md`.

1. This file is the execution source of truth.
2. Move completed tasks to a monthly “Done” subsection under the relevant month; do not delete history.
3. Mark tasks done only when evidence artifacts are committed.
4. If code reality diverges, update this plan first, then execute.
