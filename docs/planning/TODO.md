# Amy's Echo TODO — 4-Month Delivery Plan (Apr–Jul 2026)

**Last refreshed:** 2026-03-27 (updated)
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
  - Entry points: `webapp/src/gesture/workers/DetectionWorker.ts`, `webapp/src/gesture/workers/WorkerDetectionBridge.ts`, `docs/testing/benchmarks/worker_offload_2026-03-25.md`
  - Evidence: updated benchmark doc with device matrix (low-end tablet, mid-range phone, laptop).

- [ ] **APR-P0-2:** Run first device performance measurement cycle using protocol.
  - Entry points: `webapp/src/hooks/useSignLanguageDetector.ts`, `webapp/src/components/TrainingRecorder.tsx`
  - Evidence: result artefacts under `docs/testing/benchmarks/results/` following the device performance protocol.
  - Protocol: `docs/testing/benchmarks/device_performance_protocol.md`

### Done (March 2026 — early delivery)

- [x] **APR-P0-2 (protocol):** Publish realistic device performance protocol (first launch, route switch, camera flip, 20-min run).
  - Evidence: `docs/testing/benchmarks/device_performance_protocol.md` with scenarios, measurement setup, device matrix, decision criteria, and result artefact format.

- [x] **APR-P0-2 (CI baseline):** Run first performance measurement cycle (server + webapp, CI runner).
  - Evidence: `docs/testing/benchmarks/performance_report_2026-03-27.md` — full API latency benchmarks, bundle size analysis, browser navigation timing, interactive user flow verification with Playwright.
  - Finding: Added development CORS middleware to enable local webapp↔server testing.

- [x] **APR-P0-3:** Create reproducible few-shot protocol doc with leakage-safe split contract.
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

- [x] **MAY-P0-2:** Add few-shot parser/aggregation tests and strict schema checks.
  - Entry points: `server/test/`, `server/src/amyserver_tools/`
  - Evidence: new tests (`server/test/*fewshot*`) passing for mean/std aggregation and invalid-metric failures.

- [ ] **MAY-P1-1:** Define capture metadata protocol (signer/device/camera/lighting) and enforce persistence through upload/ingestion.
  - Entry points: `webapp/src/training/trainingBundle.ts`, `server/src/routes/trainingBundleRoute.ts`, `docs/training/LANDMARK_STREAM_SCHEMA.md`
  - Evidence: schema update + tests proving metadata survives end-to-end.

### Done (March 2026 — few-shot validation hardening)

- [x] **MAY-P0-2:** Added few-shot parser/aggregation tests with strict metric-schema failures.
  - Evidence: `server/test/test_train_mlp_fewshot.py`, `server/test/test_train_mlp_sweep.py`.

---

## 3) June 2026 — Operations hardening + accessibility cadence

### Goal
Reduce operational risk before next release cycle.

### Planned deliverables

- ✅ No remaining open June deliverables.

### Done (March 2026 — early delivery)

- [x] **JUN-P1-3:** Establish terminology quality gate for sign-language wording (“Gebärde”) across user-visible copy.
  - Entry points: `docs/guides/TERMINOLOGY_COMPATIBILITY_CHECKLIST.md`, `webapp/src`, `server/src/routes`
  - Evidence: `scripts/check-terminology.sh` scans user-facing source for prohibited terms; wired into `scripts/full-check.sh` CI step.

### Done (March 2026 — governance/accessibility cycle)

- [x] **JUN-P1-2:** Established recurring manual accessibility verification cadence and completed first cycle.
  - Evidence: `docs/security/GOVERNANCE_CADENCE.md` (cadence + owners + evidence templates), `docs/testing/ACCESSIBILITY_CYCLE_2026-Q1.md` (first completed cycle artifact).

### Done (March 2026 — operations hardening)

- [x] **JUN-P1-1:** Expanded operations runbook with incident drill and rollback evidence.
  - Evidence: `docs/operations/INCIDENT_DRILL_2026-03-27.md`, `docs/planning/RELEASE_0.0.2_READINESS.md`.

---

## 4) July 2026 — Release readiness for next milestone

### Goal
Package performance, reliability, and governance improvements into a release-ready quality gate.

### Planned deliverables

- [ ] **JUL-P1-1:** Publish long-session hardware baselines (FPS/thermal/battery deltas) for target caregiver devices.
  - Evidence: benchmark table in `docs/testing/benchmarks/`.

- [ ] **JUL-P2-1:** Break Metacom sentence-composition roadmap into implementation slices with acceptance criteria.
  - Entry points: `docs/metacom/METACOM_SENTENCE_COMPOSITION.md`
  - Evidence: updated roadmap with milestone checkpoints.

### Done (March 2026 — governance baseline)

- [x] **JUL-P2-2:** Published governance cadence with ownership and reusable evidence templates.
  - Evidence: `docs/security/GOVERNANCE_CADENCE.md`, `docs/security/evidence/SECURITY_MONTHLY_RECORD_2026-03.md`.

### Done (March 2026 — operations monitoring baseline)

- [x] **JUL-P1-2:** Documented production health monitoring ownership and threshold policy.
  - Evidence: `docs/operations/PRODUCTION_HEALTH_MONITORING_OWNERSHIP.md`, `docs/planning/RELEASE_0.0.2_READINESS.md`.

---

## 5) MediaPipe + Sign-Language R&D watchlist (deep-dive refresh)

### Goal
Convert recent MediaPipe release changes (v0.10.20–v0.10.33) and external sign-language best practices into actionable, testable improvements for Amy’s production path.

### Planned deliverables (pull into Apr–Jul execution as capacity allows)

- [ ] **RD-P0-1:** Run an A/B benchmark for `ImageProcessingOptions` + ROI handling to reduce landmark jitter and crop failures.
  - Why now: MediaPipe added stronger ROI validation and broader task-level image processing support in recent releases.
  - Entry points: `webapp/src/gesture/core/GestureDetector.ts`, `webapp/src/hooks/useSignLanguageDetector.ts`, `docs/testing/benchmarks/`
  - Evidence: benchmark artifact comparing baseline vs tuned ROI/crop settings (FPS, drop rate, confidence stability).

- [ ] **RD-P0-2:** Evaluate `FULL_RANGE` face detector mode impact on sign recognition robustness in non-frontal caregiver/device setups.
  - Why now: full-range face detection support/tests landed in newer MediaPipe tasks; facial context is relevant for multi-modal sign interpretation.
  - Entry points: `webapp/src/gesture/`, `integration/test/`, `docs/testing/benchmarks/`
  - Evidence: side-angle/partial-face benchmark matrix and recommendation (`enable` / `keep default`).

- [ ] **RD-P0-3:** Add signer-independent evaluation gate to few-shot workflow (no signer leakage in train/val/test manifests).
  - Why now: external best-practice review consistently flags signer leakage as the highest-risk quality trap in sign-language ML.
  - Entry points: `server/src/amyserver_tools/train_mlp.py`, `server/src/amyserver_tools/train_mlp_sweep.py`, `server/test/`
  - Evidence: manifest validator + failing test for leakage + report metric split by known/new signer.

- [ ] **RD-P1-1:** Add confidence calibration and abstention policy for low-confidence predictions.
  - Why now: best-practice review emphasizes calibrated confidence thresholds to avoid incorrect sign output under noisy conditions.
  - Entry points: `webapp/src/gesture/installMlp.ts`, `webapp/src/gesture/modelClient.ts`, `webapp/src/hooks/useSignLanguageDetector.ts`
  - Evidence: documented threshold policy + offline reliability plot or bin-based calibration table in `docs/testing/benchmarks/`.

- [ ] **RD-P1-2:** Prototype temporal smoothing/sequence modeling upgrade path (beyond per-frame classification) with strict latency budget.
  - Why now: best-practice review repeatedly shows temporal context is high-value for sign disambiguation.
  - Entry points: `webapp/src/gesture/core/ProcessingSteps.ts`, `server/training/sliding_window.py`, `docs/testing/benchmarks/`
  - Evidence: prototype comparison report (accuracy deltas + p95 latency + battery/thermal impact).

- [ ] **RD-P1-3:** Improve runtime diagnosability by surfacing MediaPipe task/backend/error context into existing logs/health diagnostics.
  - Why now: recent MediaPipe releases improved status/error propagation; we should consume that signal for faster production triage.
  - Entry points: `webapp/src/gesture/`, `server/src/routes/health.ts`, `docs/operations/`
  - Evidence: incident-style drill showing faster root-cause identification from enriched diagnostics.

---

## 6) Rules for contributors/LLMs

Planning hygiene note: outdated-doc decisions are logged in `docs/planning/OUTDATED_DOCS_AUDIT_2026-03-27.md`.

1. This file is the execution source of truth.
2. Move completed tasks to a monthly “Done” subsection under the relevant month; do not delete history.
3. Mark tasks done only when evidence artifacts are committed.
4. If code reality diverges, update this plan first, then execute.
5. Verify every listed entry point still exists before starting work; fix the roadmap immediately if a path has moved.
6. Start each task by writing down one concrete first command in the PR/report so the next LLM can resume without rediscovery.
