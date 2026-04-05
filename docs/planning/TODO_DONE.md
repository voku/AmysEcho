# Amy's Echo TODO_DONE — Completed Roadmap Archive

**Last refreshed:** 2026-04-05 (updated)
**Purpose:** archive completed roadmap items moved from `docs/planning/TODO.md` by cut/paste.

## Topic board structure (Kanban-style)

Completed items should keep a topic board reference in `docs/planning/topics/<TOPIC-ID>/TOPIC.md` for evidence and handoff context.

- **Status authority for active items:** `docs/planning/TODO.md`
- **Done archive authority:** `docs/planning/TODO_DONE.md`
- **Template for new topics:** `docs/planning/topics/_template/TOPIC_TEMPLATE.md`

---

## 1) April 2026 — Performance truth + reproducibility foundation

### Done (March 2026 — early delivery)

### Done (April 2026 — release gate governance hardening)

- [x] **APR-P0-4:** Define release performance gates (p50/p95 latency, sustained FPS, thermal, battery) and go/no-go rules.
  - Topic board: `docs/planning/topics/APR-P0-4/TOPIC.md` (details + evidence).
  - Entry points: `docs/testing/benchmarks/device_performance_protocol.md`, `docs/testing/benchmarks/performance_report_2026-03-27.md`, `docs/planning/RELEASE_0.0.2_READINESS.md`
  - Evidence: canonical gate mapping + rubric in `docs/testing/benchmarks/device_performance_protocol.md` (§8), readiness interpretation policy in `docs/planning/RELEASE_0.0.2_READINESS.md` (§7), and interpreted benchmark snapshot in `docs/testing/benchmarks/results/2026-04-03/apr_p0_4_gate_interpretation.md`.

- [x] **APR-P0-2 (protocol):** Publish realistic device performance protocol (first launch, route switch, camera flip, 20-min run).
  - Topic board: `docs/planning/topics/APR-P0-2-PROTOCOL/TOPIC.md` (details + evidence).
  - Evidence: `docs/testing/benchmarks/device_performance_protocol.md` with scenarios, measurement setup, device matrix, decision criteria, and result artefact format.

- [x] **APR-P0-2 (CI baseline):** Run first performance measurement cycle (server + webapp, CI runner).
  - Topic board: `docs/planning/topics/APR-P0-2-CI-BASELINE/TOPIC.md` (details + evidence).
  - Evidence: `docs/testing/benchmarks/performance_report_2026-03-27.md` — full API latency benchmarks, bundle size analysis, browser navigation timing, interactive user flow verification with Playwright.
  - Finding: Added development CORS middleware to enable local webapp↔server testing.

- [x] **APR-P0-3:** Create reproducible few-shot protocol doc with leakage-safe split contract.
  - Topic board: `docs/planning/topics/APR-P0-3/TOPIC.md` (details + evidence).
  - Entry points: `server/src/amyserver_tools/train_mlp.py`, `server/training/`, `docs/testing/benchmarks/`
  - Evidence: `docs/testing/benchmarks/few_shot_protocol.md` including seeds, commit SHA, dataset snapshot, split-manifest requirements.

---

## 2) May 2026 — Few-shot automation + data quality contracts

### Done (March 2026 — few-shot validation hardening)

- [x] **MAY-P0-2:** Add few-shot parser/aggregation tests and strict schema checks.
  - Topic board: `docs/planning/topics/MAY-P0-2/TOPIC.md` (details + evidence).
  - Entry points: `server/test/`, `server/src/amyserver_tools/`
  - Evidence: new tests (`server/test/*fewshot*`) passing for mean/std aggregation and invalid-metric failures.

- [x] **MAY-P0-2:** Added few-shot parser/aggregation tests with strict metric-schema failures.
  - Topic board: `docs/planning/topics/MAY-P0-2/TOPIC.md` (details + evidence).
  - Evidence: `server/test/test_train_mlp_fewshot.py`, `server/test/test_train_mlp_sweep.py`.

### Done (April 2026 — capture metadata protocol enforcement)

- [x] **MAY-P1-1:** Enforce capture metadata protocol (signer/device/camera/lighting) end-to-end through bundle creation and ingestion.
  - Topic board: `docs/planning/topics/MAY-P1-1/TOPIC.md` (details + evidence).
  - Entry points: `webapp/src/training/trainingBundle.ts`, `webapp/src/training/types.ts`, `server/src/routes/trainingBundleRoute.ts`, `docs/training/LANDMARK_STREAM_SCHEMA.md`
  - Evidence: schema extension for `captureContext` + tests proving persistence from client ZIP metadata to server manifest and ingested dataset samples.

- [x] **MAY-P1-2:** Promote signer-leakage validation into a hard quality gate for few-shot outputs.
  - Topic board: `docs/planning/topics/MAY-P1-2/TOPIC.md` (details + evidence).
  - Entry points: `server/src/amyserver_tools/train_mlp_fewshot.py`, `server/src/amyserver_tools/train_mlp_sweep.py`, `server/test/`
  - Evidence: leakage-rejection tests + signer-split report assertions verified in `docs/testing/benchmarks/results/2026-04-04/may_p1_2_signer_leakage_gate.md`.

- [x] **MAY-P0-1:** Operationalize `train_mlp_fewshot.py` as the default repeatable evaluation runner (artifacts, determinism, reporting).
  - Topic board: `docs/planning/topics/MAY-P0-1/TOPIC.md` (details + evidence).
  - Entry points: `server/src/config/index.ts`, `server/src/server.ts`, `server/src/amyserver_tools/train_mlp_fewshot.py`, `server/test/test_train_mlp_fewshot.py`, `docs/testing/benchmarks/few_shot_protocol.md`
  - Evidence: deterministic fixture-backed runner execution and artifacts in `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/` with execution note in `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_execution.md`.


---

## 3) June 2026 — Operations hardening + accessibility cadence

### Done (March 2026 — early delivery)

- [x] **JUN-P1-3:** Establish terminology quality gate for sign-language wording (“Gebärde”) across user-visible copy.
  - Topic board: `docs/planning/topics/JUN-P1-3/TOPIC.md` (details + evidence).
  - Entry points: `docs/guides/TERMINOLOGY_COMPATIBILITY_CHECKLIST.md`, `webapp/src`, `server/src/routes`
  - Evidence: `scripts/check-terminology.sh` scans user-facing source for prohibited terms; wired into `scripts/full-check.sh` CI step.

### Done (March 2026 — governance/accessibility cycle)

- [x] **JUN-P1-2:** Established recurring manual accessibility verification cadence and completed first cycle.
  - Topic board: `docs/planning/topics/JUN-P1-2/TOPIC.md` (details + evidence).
  - Evidence: `docs/security/GOVERNANCE_CADENCE.md` (cadence + owners + evidence templates), `docs/testing/ACCESSIBILITY_CYCLE_2026-Q1.md` (first completed cycle artifact).

### Done (March 2026 — operations hardening)

### Done (April 2026 — accessibility cadence continuation)

- [x] **JUN-P1-4:** Run and publish Q2 accessibility verification cycle with ownership sign-off.
  - Topic board: `docs/planning/topics/JUN-P1-4/TOPIC.md` (details + evidence).
  - Entry points: `docs/security/GOVERNANCE_CADENCE.md`, `docs/testing/`
  - Evidence: completed `docs/testing/ACCESSIBILITY_CYCLE_2026-Q2.md` report with tracked findings and ownership sign-off.

- [x] **JUN-P1-5:** Execute operations readiness refresh (incident drill + rollback + monitoring ownership review).
  - Topic board: `docs/planning/topics/JUN-P1-5/TOPIC.md` (details + evidence).
  - Entry points: `docs/operations/INCIDENT_DRILL_2026-03-27.md`, `docs/operations/PRODUCTION_HEALTH_MONITORING_OWNERSHIP.md`, `docs/planning/RELEASE_0.0.2_READINESS.md`
  - Evidence: refreshed drill artifact (`docs/operations/INCIDENT_DRILL_2026-04-04.md`) + updated ownership checklist (`docs/operations/PRODUCTION_HEALTH_MONITORING_OWNERSHIP.md`) + remediation log (`docs/operations/OPS_READINESS_REMEDIATION_LOG_2026-04.md`).

- [x] **JUN-P1-7:** Consolidate training job ownership and restart recovery so post-training cron jobs have a single reliable source of truth.
  - Topic board: `docs/planning/topics/JUN-P1-7/TOPIC.md` (details + evidence).
  - Sequencing: foundational for `JUN-P1-6`; complete ownership/recovery contract before enabling cron reconciliation/retention/summaries.
  - Entry points: `server/src/server.ts`, `server/src/services/trainingOrchestrator.ts`, `server/src/services/dgsAutoPretrainService.ts`, `server/test/`
  - Evidence: architecture decision note in `docs/planning/JUN-P1-7_TRAINING_JOB_OWNERSHIP_DECISION_2026-04-05.md` plus recovery/dedupe regression coverage in `server/test/trainingOrchestrator.test.ts`, backed by persisted restart-state behavior in `server/src/services/trainingOrchestrator.ts`.

- [x] **JUN-P1-1:** Expanded operations runbook with incident drill and rollback evidence.
  - Topic board: `docs/planning/topics/JUN-P1-1/TOPIC.md` (details + evidence).
  - Evidence: `docs/operations/INCIDENT_DRILL_2026-03-27.md`, `docs/planning/RELEASE_0.0.2_READINESS.md`.

---

## 4) July 2026 — Release readiness for next milestone

### Done (April 2026 — Metacom roadmap slicing)

- [x] **JUL-P2-1:** Re-scope Metacom sentence-composition roadmap into release slices with acceptance criteria and test gates.
  - Topic board: `docs/planning/topics/JUL-P2-1/TOPIC.md` (details + evidence).
  - Entry points: `docs/metacom/METACOM_SENTENCE_COMPOSITION.md`, `webapp/src/services/metacomSentenceFlowService.ts`, `webapp/src/services/metacomRecommendationService.ts`
  - Evidence: release-slice roadmap with implementation sequence, acceptance criteria, test gates, and verification plan in `docs/metacom/METACOM_SENTENCE_COMPOSITION.md` (`Release-Slices (JUL-P2-1)` + `Verifikationsplan` sections).

### Done (March 2026 — governance baseline)

- [x] **JUL-P2-2:** Published governance cadence with ownership and reusable evidence templates.
  - Topic board: `docs/planning/topics/JUL-P2-2/TOPIC.md` (details + evidence).
  - Evidence: `docs/security/GOVERNANCE_CADENCE.md`, `docs/security/evidence/SECURITY_MONTHLY_RECORD_2026-03.md`.

### Done (March 2026 — operations monitoring baseline)

- [x] **JUL-P1-2:** Documented production health monitoring ownership and threshold policy.
  - Topic board: `docs/planning/topics/JUL-P1-2/TOPIC.md` (details + evidence).
  - Evidence: `docs/operations/PRODUCTION_HEALTH_MONITORING_OWNERSHIP.md`, `docs/planning/RELEASE_0.0.2_READINESS.md`.

---

## 5) MediaPipe + Sign-Language R&D watchlist (deep-dive refresh)

### Done

- [x] **RD-P0-3:** Add signer-independent evaluation gate to few-shot workflow (no signer leakage in train/val/test manifests).
  - Topic board: `docs/planning/topics/RD-P0-3/TOPIC.md` (details + evidence).
  - Why now: signer leakage remains the highest-risk quality trap in sign-language ML.
  - Entry points: `server/src/amyserver_tools/train_mlp.py`, `server/src/amyserver_tools/train_mlp_sweep.py`, `server/test/`
  - Evidence: signer leakage validator in `train_mlp.py`, required split-manifest enforcement and signer split counts in `train_mlp_sweep.py`, regression coverage in `server/test/test_train_mlp_signer_split.py`, and sweep report metrics split by known/new signer in `docs/testing/benchmarks/results/2026-04-04/rd_p0_3_signer_split_gate.md`.

- [x] **RD-P1-1:** Add confidence calibration and abstention policy for low-confidence predictions.
  - Topic board: `docs/planning/topics/RD-P1-1/TOPIC.md` (details + evidence).
  - Why now: calibrated thresholds reduce wrong outputs in noisy conditions.
  - Entry points: `webapp/src/gesture/installMlp.ts`, `webapp/src/gesture/modelClient.ts`, `webapp/src/hooks/useSignLanguageDetector.ts`
  - Evidence: documented threshold policy and reliability calibration matrix in `docs/testing/benchmarks/rd_p1_1_confidence_calibration_2026-04-05.md`, backed by targeted regression suites for processing decisions, hook telemetry rejections, and install-time null suppression behavior.

- [x] **RD-P1-3:** Improve runtime diagnosability by surfacing MediaPipe task/backend/error context into existing logs/health diagnostics.
  - Topic board: `docs/planning/topics/RD-P1-3/TOPIC.md` (details + evidence).
  - Why now: recent MediaPipe releases improved status/error propagation; we should consume that signal for faster production triage.
  - Entry points: `webapp/src/gesture/`, `server/src/routes/health.ts`, `docs/operations/`
  - Evidence: incident-style drill showing faster root-cause identification from enriched diagnostics in `docs/operations/INCIDENT_DRILL_RD-P1-3_2026-04-03.md`.

<!-- AUTO-GENERATED-DONE-HISTORY:START -->

## 6) Historical recovery from git timeline (auto-generated)

This section is generated by `scripts/planning/recover_todo_done_history.py` by walking git history commit-by-commit and extracting every unique `[x]` task from all historical `TODO.md` paths.

Discovered TODO paths:
- `docs/TODO.md`
- `docs/planning/TODO.md`

Recovered entries by TODO path:
- `docs/TODO.md`: **0** recovered done entries
- `docs/planning/TODO.md`: **192** recovered done entries

### 2026-02-04

- [x] **Add Dependency Scanning to CI:** ✅ **IMPLEMENTED** — Added automated `npm audit` checks to CI pipeline for webapp, server, and integration packages with high severity threshold. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **API Documentation:** ✅ **EXPANDED** — Comprehensive update to `docs/integration/API.md` with detailed request/response examples, HTTP status codes, error codes table, validation requirements, rate limiting details, and examples for all endpoints including authentication, profiles, samples, training, and model serving. _Updated 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Architecture Decision Records:** ✅ **CREATED** — Created `docs/architecture/ADR.md` documenting 10 key architectural decisions: Hybrid-First Architecture, JWT Authentication, MLP for Gesture Recognition, MediaPipe Integration, IndexedDB Storage, JSON File Database, German-First UI, Multimodal Input, Rate Limiting Strategy, and CodeQL Security Scanning. Each ADR includes context, rationale, consequences, and alternatives considered. _Created 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Audit Logging:** ✅ **IMPLEMENTED** — Created `server/src/services/auditLogger.ts` with structured logging for security-sensitive events (authentication, profile access, data operations, security events). Logs to console (JSON in production) and persists to `data/audit.log` in production. Integrated with login, refresh, and rate limiting. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Automated Accessibility Tests:** ✅ **IMPLEMENTED** — Added comprehensive automated tests for WCAG 2.1 compliance in `webapp/src/components/accessibility.test.tsx` (25 tests). Tests cover ARIA labels, semantic HTML, color contrast validation, keyboard navigation, screen reader compatibility, and Amy First accessibility principles. All tests passing. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Automatic recovery system tests:** ✅ **VERIFIED** — Already implemented in `webapp/src/gesture/utils/__tests__/ErrorRecoveryManager.test.ts`. Tests cover circuit breaker, fallback mode activation, cooldown periods, and recovery telemetry. _Verified 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Cache Behavior Testing:** ✅ **IMPLEMENTED** — Added 3 tests in `server/test/healthCheck.test.ts` for Python dependency cache behavior: consecutive call caching, consistent structure across calls, and cache performance validation. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Cache Testing:** ✅ **COMPLETE** — Integration tests for cache TTL already implemented in `server/test/healthCheck.test.ts` (lines 142-187, "Python Dependency Cache TTL" suite with 3 tests). _Verified 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `fa9759e` (Update TODO.md - mark accessibility tests and verification complete).
- [x] **Consider Replacing @types/nodemailer:** ✅ **ANALYZED** — Documented 11MB AWS SDK bloat from `@types/nodemailer` (27 AWS packages + 1.3MB crypto). Amy's Echo only uses basic SMTP/sendmail, not AWS SES. Recommended creating minimal custom type definitions to remove bloat while maintaining type safety. Full analysis in `docs/deps/NODEMAILER_TYPES_BLOAT_ANALYSIS.md`. Decision pending on whether to implement Option 1 (custom types) or accept current state. _Analyzed 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Dependency Vulnerability Scanning:** ✅ **IMPLEMENTED** — Added `npm audit` checks to main CI workflow. See also "Add Dependency Scanning to CI" above. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Emergency gesture detection tests:** ✅ **IMPLEMENTED** — 100% coverage for "hilfe" gesture detection within 50ms threshold. Created `webapp/src/services/__tests__/p0CriticalPaths.test.ts` with 20 tests covering emergency gesture processing, timing validation, and sequential processing. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Error handling tests:** ✅ **ANALYZED** — Comprehensive coverage analysis completed in `docs/testing/TEST_COVERAGE_ANALYSIS.md`. Current estimated coverage: ~90-95% (27+ error test cases, comprehensive ErrorRecoveryManager tests). Tests cover network errors, camera errors, MediaPipe errors, memory errors, circuit breaker pattern, fallback mode, recovery telemetry, German error messages, failure window management, health monitoring, and automatic recovery (P0). Exceeds >85% coverage goal. Recommendations provided for stress tests and concurrent error scenarios. _Analyzed 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `4100be8` (Add comprehensive test coverage analysis and complete TODO items).
- [x] **Fix diff/jsdiff Vulnerability:** ✅ **FIXED** — Updated `diff` package to resolve DoS vulnerability in parsePatch/applyPatch (GHSA-73rr-hh4g-fpgx). Fixed via `npm audit fix`. All server vulnerabilities resolved. _Fixed 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Focus Management Tests:** ✅ **IMPLEMENTED** — Added comprehensive focus management tests for modal dialogs in `webapp/src/components/__tests__/FocusManagement.test.tsx` (14 tests). Tests cover modal focus trapping, focus order validation, keyboard navigation, focus state verification, keyboard activation (Enter/Space keys), and main navigation. All tests passing. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `fa9759e` (Update TODO.md - mark accessibility tests and verification complete).
- [x] **Gesture history & replay tests:** ✅ **IMPLEMENTED** — Full coverage for storing/replaying last 10 gestures. Tests verify 10-gesture buffer limit, replay by ID, undo support, and emergency replay history. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Gesture recognition accuracy tests:** ✅ **ANALYZED** — Comprehensive coverage analysis completed in `docs/testing/TEST_COVERAGE_ANALYSIS.md`. Current estimated coverage: ~85-90% (440 gesture tests across 30 test files). Tests cover gesture detection, accuracy enhancement, temporal analysis, landmark processing, MediaPipe integration, MLP prediction, emergency gesture detection (P0), gesture history/replay (P0), and model updates (P0). Coverage goals likely met for functional testing. Recommendations provided for accuracy metrics, performance benchmarks, and cross-device testing to reach >90%. _Analyzed 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `4100be8` (Add comprehensive test coverage analysis and complete TODO items).
- [x] **Health Check Endpoint Enhancement:** ✅ **IMPLEMENTED** — Enhanced `/health` and `/api/v1/health` endpoints with detailed checks for database connectivity, global model availability, Python dependencies (numpy, sklearn, mediapipe), and training manifest accessibility. Returns overall system status (ok/degraded) with timestamp and detailed check results. Added comprehensive test coverage. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **High Contrast Mode Tests:** ✅ **IMPLEMENTED** — Added automated visual regression tests for high contrast mode in `webapp/src/components/__tests__/HighContrastMode.test.tsx` (16 tests). Tests cover high contrast enablement, system preference detection, CSS class application, persistence to localStorage, visual regression, contrast ratio validation, and integration with other accessibility features. All tests passing. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `fa9759e` (Update TODO.md - mark accessibility tests and verification complete).
- [x] **HSTS Headers:** ✅ **IMPLEMENTED** — Added `hstsHeaders` middleware in `server/src/middleware/httpsEnforcement.ts`. Adds Strict-Transport-Security header in production with max-age=31536000, includeSubDomains, and preload. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **HTTPS Enforcement:** ✅ **IMPLEMENTED** — Added `httpsEnforcement` middleware in `server/src/middleware/httpsEnforcement.ts`. Rejects non-HTTPS requests in production mode with 403 status. Supports X-Forwarded-Proto and X-Forwarded-Ssl headers for reverse proxy setups. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Manual Health Check Verification:** ✅ **COMPLETE** — Started server, tested `/health` endpoint behavior. Verified degraded status reporting, Python dependency check caching, response structure, and status aggregation logic. Full verification report in `docs/verification/HEALTH_CHECK_VERIFICATION_REPORT.md`. _Verified 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Per-User Rate Limiting:** ✅ **IMPLEMENTED** — Created `server/src/middleware/userRateLimiter.ts`. Uses user ID for authenticated requests, falls back to IP for unauthenticated. Pre-configured limiters for different endpoint types (standard, strict, auth, training, model download). _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Pre-cached responses tests:** ✅ **VERIFIED** — Already implemented in `webapp/src/training/trainingQueue.test.ts` for IndexedDB offline queueing. Additional tests in `webapp/src/services/__tests__/amyFirstCritical.test.ts` for session persistence. _Verified 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Production Logging:** ✅ **VERIFIED** — Structured JSON logging already implemented in `logger.ts`. Outputs JSON in production mode, human-readable in development. Supports log levels (ERROR, WARN, INFO, DEBUG), context tracking (userId, requestId, duration), and specialized logging methods for different operations (API requests, database ops, gesture processing, training, etc.). _Verified 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Refresh Token Rotation:** ✅ **IMPLEMENTED** — Updated `server/src/services/authService.ts` with `refreshTokensWithRotation()`. Each refresh issues new tokens and invalidates old ones. Token hash stored on user record for verification. Detects and rejects reused/stolen tokens. Added tests in `server/test/refreshTokenRotation.test.ts`. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Runtime Verification:** ✅ **COMPLETE** — Manual test of health endpoint already documented in `docs/verification/HEALTH_CHECK_VERIFICATION_REPORT.md`. _Verified 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `fa9759e` (Update TODO.md - mark accessibility tests and verification complete).
- [x] **Security Test Suite in CI:** ✅ **VERIFIED** — `profileAuthorization.test.ts` and `securityVulnerabilities.test.ts` already run as part of main CI test suite via `full-check.sh`. _Verified 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Ship a kid-focused, production-ready DGS baseline model: curate the starter vocabulary (colors, food, caregiver phrases), train a balanced multimodal model, and place the resulting `data/amy_model.npz` under `server/data/models/global/` with a recorded SHA256 checksum so deploys always carry working weights. (Baseline artifact + checksum committed, kid starter preset in `server/data/config/kid_starter_preset.json`.)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** **Finalize quality gates for user-generated training data:** define per-sign minimums, jitter thresholds for hand/pose/face stability, and review steps before promoting caregiver uploads into the global baseline. (Thresholds in `server/src/constants/trainingQuality.ts`, documented in `docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`.)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Close the multimodal feedback loop in production: validate that camera overlay previews (hands + pose + face) match what the server ingests, confirm smoothing/feature metadata is preserved through training, and add an E2E checklist for “record → preview → upload → train → download personalized model”. (Checklist in `docs/operations/PRODUCTION_TRAINING_CHECKLIST.md`.)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Define a **landmark confidence policy**: thresholds for visibility, minimum frames per window, and how to handle dropped frames (e.g., interpolate vs. discard).
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Implement **landmark normalization** (hand size, body-relative coordinates) with a documented formula and unit tests.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Prototype **Holistic vs. Hands-only** performance on target devices and document FPS/thermal impact.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add **non-manual feature extraction** from Face Mesh and Pose (e.g., eyebrow raise, head pitch/yaw, mouth openness) and measure incremental accuracy lift.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Define a **client payload schema** for streamed landmarks (JSON or protobuf) including timestamps, handedness, visibility, and schema version.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Specify **windowing strategy** (window length, stride) and alignment method (CTC vs. seq2seq) for gesture + language modeling.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Implement **temporal smoothing** and jitter reduction for incoming landmark sequences.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add **re-init logic** when landmark confidence drops (request a keyframe or reset state).
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Define **response format** including per-token timestamps, confidence scores, and error codes.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Identify or build a **sign-language dataset** that includes non-manual markers; document label format and split strategy.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Define **evaluation metrics** (WER, gloss accuracy, latency, FPS) and add a baseline report template.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add **bandwidth/latency budgets** and validate end-to-end streaming limits in staging.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Instrument **server inference latency** and **client capture FPS** with logging/metrics dashboards.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Upgrade the sign language detector (`webapp/src/gesture/`) to stream a rolling buffer of frames alongside the existing landmark payload.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Extend the Training page to record both the landmark timeline and captured frames while recording is active.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Persist the sample shape in the training queue (`webapp/src/training/trainingQueue.ts`). Use IndexedDB via OPFS for offline support.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Harden multimodal capture for kids: verify pose/face/hand landmark availability across supported browsers/devices, and surface guidance when a modality drops (e.g., "Please keep face in frame").
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add privacy-safe preview controls: allow caregivers to toggle raw video vs. skeleton-only while keeping overlay drawing for hands/pose/face visible.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Create `uploadTrainingBundle` that builds a zip with `{metadata.json, landmarks.json, still.jpg}`.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Store pending bundles in IndexedDB. Flush them through the training uploader hook as soon as connectivity is available.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add unit coverage that mocks the queue and asserts the zip payload structure.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Ensure multimodal bundle fidelity: confirm `metadata.json` and `landmarks.json` keep pose/face features, handedness, smoothing params, and add regression tests that fail if fields are dropped.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Implement `/api/v1/dgs/sample-bundles` in `server/src/server.ts` that accepts multipart uploads. Save bundles under `data/uploads/<profileId>/<timestamp>/`, reject bundles missing `landmarks.json` with HTTP 400 after cleaning up, and register successful uploads in `data/datasets/training_manifest.json`.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Write integration tests in `server/test/trainingBundles.test.ts` that POST a fixture zip and assert the manifest entry.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Mirror client bundle richness: validate that ingested samples persist pose/face landmarks, derived features (e.g., lip-pointing distance), smoothing metadata, and consent/license details into dataset manifests without dropping fields.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add ingestion-level analytics: log counts of missing modalities, rejected bundles, and per-profile coverage so we can spot shaky cameras or poor lighting before training.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Extend `train_mlp.py` to load from `training_manifest.json`, extracting landmarks either from `landmarks.json` or by running MediaPipe on the stored clip. Cache extracted landmarks back to `data/uploads/.../landmarks_cached.json`.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Produce both global (`data/models/global/amy_model.npz`) and per-profile weights (`data/models/<profileId>/amy_model.npz`).
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Emit a structured training report (JSON) that `/train-model` returns.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Promote multimodal training: add pose/face inputs and non-manual features to the trainer, support modality dropout (natural via zero-filling), and implement multimodal data augmentation.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Benchmark accuracy vs. current hand-only MLP: collect metrics on multimodal vs. hand-only performance. _See `docs/testing/benchmarks/multimodal_vs_handonly_report.md` for the current benchmark snapshot._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Provide a "kid starter" training preset: pre-load the trainer with core DGS glosses, class weights, and data splits that reflect the curated vocabulary. _See `server/data/config/kid_starter_preset.json`._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Expand `server/src/server.ts`'s `/latest-mlp-model` handler to accept `?profileId=` and serve personalized bundles when available; fall back to the global model otherwise.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Update the webapp model client (`webapp/src/gesture/modelClient.ts`) to request the personalized model first.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Notify users when a newer model version is loaded.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Surface modality coverage and training version in model headers so caregivers know they are using the multimodal DGS model without forcing additional language tags.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add end-to-end tests: one in `integration/` that records a fake sign, uploads it, triggers `/train-model`, downloads the new weights, and asserts the model file checksum changes.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Document the flow in `docs/` with a sequence diagram (capture → bundle → training → distribution).
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Create a manual QA checklist covering "record sign", "bundle files present", "training job succeeds", "personalized model downloaded".
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Extend manual and automated QA for multimodal overlays: include steps/screenshots showing landmark previews (hand/pose/face), expected German guidance when modalities are missing, and the end-to-end path from preview to personalized model download.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Track latency and reliability: add metrics collection for capture → upload → training → download timings, and publish a weekly dashboard to ensure the full cycle stays within the kid-friendly budget (<50 ms/frame inference, fast uploads on spotty connections). _See `docs/training/TRAINING_METRICS_DASHBOARD.md`._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add audio capture service for recording speech during gesture capture
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Integrate audio recording with training recorder (captures audio alongside video)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Update training bundle types to include audio files
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Extend training bundle creation to package audio files in ZIP bundles
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Update server-side bundle ingestion to handle audio files
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Modify training manifest to track audio data
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add comprehensive unit tests for audio capture service (16 tests)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Create audio preprocessing utilities for format normalization
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Update Python training tools to accept and process audio data
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Audio features extracted and attached to training samples
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add integration tests for complete audio+gesture training flow (4 tests)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Implement multimodal fusion layer (concatenate audio + visual features)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add zero-padding for samples without audio to maintain consistent dimensions
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Update MLP input layer to handle combined feature dimensions
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Document audio capture settings and troubleshooting
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Create browser-based MFCC extraction service (Web Audio API)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Implement live audio recognition service for real-time capture
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Extend `mlpPredict()` to accept audio features parameter
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add audio fusion logic in `installMlp.ts`
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Create integration guide (`docs/LIVE_AUDIO_INTEGRATION_GUIDE.md`)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Integrate live audio service with `GestureRecognitionOrchestrator`
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Wire up audio extraction in `handleGestureResults()`
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Pass audio features to MLP in `GestureDetectionStep`
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add unit tests for live multimodal recognition
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** End-to-end validation with multimodal model
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add visual status indicators (registered, training, ready).
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Auto-trigger model training after custom sign registration.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Show pending signs that need more training samples.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add sign readiness percentage based on sample count and quality.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Background model updates for custom signs. _See `customGestureRegistry.ts` with `BACKGROUND_MODEL_UPDATE_EVENT` for automatic training triggers._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Offline queueing for uploads in the custom sign flow.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Training data quality metrics to decide when user-contributed data is ready for the global baseline. _See `docs/training/GLOBAL_BASELINE_PROMOTION_POLICY.md`._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add search in the training screen for the labels.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Define Metacom board schema and starter fixtures in the webapp.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Build an import pipeline for Metacom symbol/board bundles.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Build stable grid UI with Metacom categories, colors, and German labels.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add migration strategy for existing boards with safe fallback behavior. _See `docs/metacom/METACOM_MIGRATION_STRATEGY.md`._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Validate licensing constraints and document approved symbol sets (Import durch Nutzer, keine mitgelieferten Symbole).
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add profile registry database.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Implement profile deletion endpoint with cascade cleanup.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add profile export with all associated training data.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Migrate to UUID-based profile IDs.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Add profile metadata storage (age, creation date, etc.).
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Implement profile merge/transfer tooling.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Multi-device profile sync.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Profile sharing between caregivers.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** Profile backup/restore automation.
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** ~~**Fix AWS SDK Vulnerabilities**~~: ❌ **FALSE POSITIVE** — AWS SDK is NOT directly used. The 19 high severity vulnerabilities from `@aws-sdk/*` are transitive dependencies of `@types/nodemailer` (TypeScript type definitions only). The actual nodemailer uses sendmail/SMTP transport, not AWS SES. These are dev-time type definitions that don't affect runtime. _Verified 2026-02-04 by checking `npm why @aws-sdk/client-sesv2` → comes from `@types/nodemailer@7.0.5`._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** ~~**Add CodeQL Scanning Workflow**~~: ❌ **REMOVED** — Custom CodeQL workflow conflicted with GitHub's default CodeQL setup (repository-level setting). GitHub's default setup already provides automated security scanning with security-extended queries. Custom workflow removed to avoid CI failures. _Repository uses GitHub's default CodeQL setup enabled in Settings → Code security and analysis._ _Removed 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** **Verify Test Suite Execution** - Installed dependencies, ran tests, confirmed 112 passing (18 failures unrelated to our changes)
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** **Document Actual Test Count** - Verified: 112 TypeScript tests passing, 11 tests for our changes
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** **Run Full Integration Test Suite** - Confirmed apiIntegration changes work correctly, no regressions
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Task:** **Update TODO.md with PR Review Section** - Added PR Review Response section documenting commits 9875104 and 7d80972
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
- [x] **Verify Test Execution:** ✅ **COMPLETE** — Confirmed all tests pass: 919 webapp tests passing, 141/159 server tests passing (18 failures due to missing Python dependencies, which is expected). Test execution verified on 2026-02-04.
  - First seen done in `docs/planning/TODO.md` at commit `fa9759e` (Update TODO.md - mark accessibility tests and verification complete).
- [x] **Zero-downtime model update tests:** ✅ **IMPLEMENTED** — Tests for version tracking, update availability, polling control, callbacks, and status reporting. See `webapp/src/services/__tests__/p0CriticalPaths.test.ts`. _Implemented 2026-02-04._
  - First seen done in `docs/planning/TODO.md` at commit `e5288e3` (Add high contrast mode tests (16 tests)).
### 2026-02-06

- [x] **Memory Profiling:** ✅ **ANALYZED** — Health check cache stores a single object (~200 bytes): `{ status, message, timestamp }`. This is negligible compared to the benefit of avoiding Python process spawns (~20 MB each). Full analysis in `docs/architecture/AMY_FIRST_INFRASTRUCTURE_NARRATIVE.md`. _Analyzed 2026-02-06._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
- [x] **Task:** Add a sentence composer for Metacom boards (symbol queue with backspace/clear/speak) to support dynamic multi-symbol utterances. _See `webapp/src/components/SentenceComposer.tsx`, integrated into `MetacomBoard.tsx`._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
- [x] **Task:** Persist `symbolId` alongside gesture `label` in training bundles, manifest entries, and training reports so recognition and training share the same symbol identity. _Added to `TrainingBundlePayload`, `buildMetadata()`, server manifest schema, and `DatasetSample`._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
- [x] **Task:** Replace the local-only gesture→meaning mapping with a single mapping layer that resolves `gesture label → symbolId → boardId` using Metacom boards (fallback to defaults when missing). _See `webapp/src/services/metacomMappingService.ts`._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
- [x] **Task:** Use the mapping layer in recognition UI to show the Metacom symbol (emoji/color/category) and to drive TTS output consistently. _See updated `SignLanguageHistory.tsx`._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
- [x] **Task:** Sync imported Metacom bundles per profile (server-side storage + profile export) so symbols stay consistent across devices. _See `server/src/routes/metacomRoutes.ts` (GET/PUT/DELETE), profile export in `profileDataService.ts`._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
- [x] **Task:** Add integration tests for the full cycle: Metacom symbol selection → training bundle includes `symbolId` → recognition output maps to the same symbol/board. _See `integration/test/metacom-full-cycle.test.ts` (6 tests)._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
- [x] **Task:** **Memory Profiling** - ✅ Cache stores ~200 bytes; negligible. See `docs/architecture/AMY_FIRST_INFRASTRUCTURE_NARRATIVE.md`. _Analyzed 2026-02-06._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
- [x] **Task:** **Amy First Narrative** - ✅ Created `docs/architecture/AMY_FIRST_INFRASTRUCTURE_NARRATIVE.md` mapping every infrastructure change to Amy First principles. _Created 2026-02-06._
  - First seen done in `docs/planning/TODO.md` at commit `8a40691` (docs: add Amy First narrative, memory profiling analysis, update TODO.md).
### 2026-03-02

- [x] **Task:** Create a dedicated pre-tag checklist in `docs/planning/RELEASE_0.0.1_READINESS.md` so contributors can run a consistent Go/No-Go flow.
  - First seen done in `docs/planning/TODO.md` at commit `0ae3f69` (docs: make TODO issue-ready for copilot and normalize release doc naming).
### 2026-03-03

- [x] **Task:** Create a dedicated pre-tag checklist in `docs/planning/RELEASE_0.0.2_READINESS.md` so contributors can run a consistent Go/No-Go flow.
  - First seen done in `docs/planning/TODO.md` at commit `7ba6e86` (server: reject unknown profile model requests explicitly).
- [x] **Task:** Execute the full pre-tag verification command set and attach results to the release notes.
  - First seen done in `docs/planning/TODO.md` at commit `7ba6e86` (server: reject unknown profile model requests explicitly).
- [x] **Task:** Complete the functional Go/No-Go checklist (auth/session, profile scope, full training loop, health endpoint status, German UX validation).
  - First seen done in `docs/planning/TODO.md` at commit `7ba6e86` (server: reject unknown profile model requests explicitly).
- [x] **Task:** **[Release] Run pre-tag verification command set and attach output to release notes**
  - First seen done in `docs/planning/TODO.md` at commit `7ba6e86` (server: reject unknown profile model requests explicitly).
- [x] **Task:** **[Release] Complete functional Go/No-Go checks (auth, profile, training flow, health, German UX)**
  - First seen done in `docs/planning/TODO.md` at commit `7ba6e86` (server: reject unknown profile model requests explicitly).
### 2026-03-09

- [x] **Add post-training per-label diagnostics that reflect real usable data:** extend the training report with accepted bundles, rejected bundles, generated windows, prototype counts, and per-label confusion signals so we can see whether labels like `satt` and `trinken` are collapsing. _Implemented in `server/src/amyserver_tools/train_mlp.py`._
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Make active model source explicit during recognition:** show whether the detector is currently using the profile model or the global fallback, including model version/source in the detection screen and training status UI. This should prevent “wrong but confident” profile sessions that are actually running on the global model. _Implemented in `SignLanguageRecorder.tsx` and `TrainingUpload.tsx`._
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Re-run targeted sparse-vocabulary verification with `satt`/`trinken` fixtures:** add regression coverage for the concrete failure mode (“peace sign collapses to `trinken`”) so threshold, prototype, and split changes are measured against a real sparse-data scenario before deeper model changes. _Implemented in `webapp/src/gesture/installMlp.test.ts` plus trainer/report tests._
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Stop train/validation leakage across windows from the same clip:** preserve `sourceBundleId` (or an equivalent clip grouping key) through sliding-window sample generation in the Python trainer and switch validation planning from random window shuffle to group-aware split by bundle/clip. _Implemented in `server/training/sliding_window.py` and `server/src/amyserver_tools/train_mlp.py`._
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Surface label readiness and sparse-data warnings in the webapp:** expose the new training diagnostics in the training flow so caregivers can see which label still needs cleaner samples, not just whether a bundle upload technically succeeded. _Implemented in `TrainingUpload.tsx`._
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Task:** **Fix the real end-to-end profile recognition regression first**
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Task:** **Make Python execution deterministic across app, tests, and integration**
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Task:** **Turn backup/export into a real caregiver restore flow**
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Task:** **Repair Metacom/Admin build health before trusting webapp quality gates again**
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Task:** **Make settings and local data actions explicitly multi-profile safe**
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Task:** **Close trainer test drift and publish one stable quality-gate report**
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
- [x] **Treat recognition score as an uncalibrated model score until calibrated:** review where `%` confidence is shown in the recognition UI and telemetry, and either calibrate it properly or relabel/de-emphasize it so weak predictions do not look like medical-grade certainty. _Implemented by changing recorder wording from certainty to model score / recognition value._
  - First seen done in `docs/planning/TODO.md` at commit `8e1a0dc` (Gesture Recognition: Add NULL class, Adaptive Augmentation, and IndexedDB caching).
### 2026-03-18

- [x] **Task:** Keep training capture focused on visual DGS data (hands, pose, face, still image, clip)
  - First seen done in `docs/planning/TODO.md` at commit `090a49e` (Finalize visual-only DGS cleanup).
- [x] **Task:** Keep live recognition focused on visual DGS inference without microphone input
  - First seen done in `docs/planning/TODO.md` at commit `090a49e` (Finalize visual-only DGS cleanup).
- [x] **Task:** Remove audio files and audio metadata from new training bundles
  - First seen done in `docs/planning/TODO.md` at commit `090a49e` (Finalize visual-only DGS cleanup).
- [x] **Task:** Remove live microphone capture and audio-only inference from the webapp runtime
  - First seen done in `docs/planning/TODO.md` at commit `090a49e` (Finalize visual-only DGS cleanup).
- [x] **Task:** Remove server-side audio preprocessing and multimodal trainer fusion logic
  - First seen done in `docs/planning/TODO.md` at commit `090a49e` (Finalize visual-only DGS cleanup).
- [x] **Task:** Align focused tests with the visual-only contract
  - First seen done in `docs/planning/TODO.md` at commit `090a49e` (Finalize visual-only DGS cleanup).
### 2026-03-21

- [x] **Task:** **P0: Add startup telemetry milestones for camera and detector readiness**
  - First seen done in `docs/planning/TODO.md` at commit `b2e8026` (Harden concurrent training upload stress coverage).
- [x] **Task:** **P1: Implement adaptive camera constraints policy**
  - First seen done in `docs/planning/TODO.md` at commit `b2e8026` (Harden concurrent training upload stress coverage).
- [x] **Task:** **P1: Add automated non-manual marker quality checks**
  - First seen done in `docs/planning/TODO.md` at commit `b2e8026` (Harden concurrent training upload stress coverage).
- [x] **Task:** Add concurrency stress tests for training bundle ingestion and retry storms. _Done: `server/test/trainingBundles.test.ts` now includes both (a) a 12-upload success burst and (b) a mixed success/failure burst, asserting no manifest-entry loss/corruption, unique IDs for successful uploads, and hook invocation counts only for accepted bundles._
  - First seen done in `docs/planning/TODO.md` at commit `b2e8026` (Harden concurrent training upload stress coverage).
- [x] **Task:** **[Post-v0.0.2] Add concurrency stress tests for training bundle ingestion/retry storms**
  - First seen done in `docs/planning/TODO.md` at commit `865bda6` (Address review findings for camera/session safety and tests).
### 2026-03-23

- [x] **Task:** Import reusable upstream reference assets into `docs/training/external/signlanguage_recognition/` with provenance and license notes.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Publish adaptation blueprint in `docs/training/DGS_SIGNLANG_REUSE_IMPLEMENTATION_PLAN.md` with concrete Amy's Echo integration tasks.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Build upstream source index in `docs/training/external/signlanguage_recognition/SOURCE_FILE_INDEX.md` so future contributors can locate migration-relevant files fast.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Build detailed handoff map in `docs/training/external/signlanguage_recognition/HANDOFF_IMPLEMENTATION_MAP.md` with prioritized backlog and acceptance criteria.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Expose model artifact schema/runtime headers (`X-Feature-Schema-Version`, window sizes, frame feature size, and optional training config snapshot fields) in `/latest-mlp-model` responses to make inference contract explicit for clients and diagnostics.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Implement artifact contract validation metadata for model serving (`artifact_contract` in `training_metadata.json`) and expose contract status/reason headers in `/latest-mlp-model`.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Consume contract status in webapp `modelClient` and reject `invalid` profile responses to force safe fallback to global/cached models. _Extended: client now parses `X-Model-Feature-Mode`, rejects `relative_delta` by default for safety, and allows explicit opt-in experiments via `VITE_ENABLE_RELATIVE_DELTA_MODEL=1`._
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Implement fixed-window normalization utility in `server/training/sliding_window.py` (`normalize_frame_sequence`) with Python tests for padding/truncation/weight validation and short-clip window generation.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Add unknown-threshold inference gating telemetry assertions (`mlp_prediction_rejected` with score/threshold/reason payload) in `useSignLanguageDetector` tests.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Publish extraction completeness + blind-spot audit in `docs/training/external/signlanguage_recognition/EXTRACTION_COMPLETENESS_AUDIT.md` to confirm implemented vs pending value.
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Benchmark optional relative-motion features against current absolute baseline. _Done: `docs/testing/benchmarks/relative_vs_absolute_sparse_profile_report_2026-03-23.md` shows `absolute` (0.2464) outperforming `relative_delta` (0.1739) on sparse-profile clip split; default remains absolute._
  - First seen done in `docs/planning/TODO.md` at commit `b615dcd` (Harden MLP artifact feature-mode contract handling).
- [x] **Task:** Expand offline extraction snapshot with additional upstream training/runtime files (sweeps, stable training script, calculators, graph configs, conversion scripts, label map) and publish final blind-spot validation handoff doc for no-upstream-access continuation. _Done: `docs/training/external/signlanguage_recognition/CODE_REVIEW_BLIND_SPOT_VALIDATION_2026-03-23.md`._
  - First seen done in `docs/planning/TODO.md` at commit `86eeff8` (Expand SignLanguageRecognition offline extraction and review validation).
### 2026-03-25

- [x] **Task:** Draft `v0.0.2` release notes with known limitations and mitigation ownership. _Done: draft published in `docs/planning/RELEASE_0.0.2_NOTES.md` with scope, limitations, mitigations/owners, and rollback notes._
  - First seen done in `docs/planning/TODO.md` at commit `ebae288` (docs: add repeatable manual runtime smoke verification flow).
- [x] **Task:** **[Release] Draft and review v0.0.2 release notes with known limitations and mitigations**
  - First seen done in `docs/planning/TODO.md` at commit `ebae288` (docs: add repeatable manual runtime smoke verification flow).
- [x] **Task:** Merge reusable extraction insights into maintained project docs (`docs/training/SIGNLANG_REUSE_PLAYBOOK.md`) and remove the unmaintained raw snapshot directory `docs/training/external/signlanguage_recognition/`.
  - First seen done in `docs/planning/TODO.md` at commit `ebae288` (docs: add repeatable manual runtime smoke verification flow).
- [x] **Task:** Harden artifact label consistency by persisting `labels` in `training_metadata.json` and rejecting `/latest-mlp-model` responses when `artifact_contract.label_count` does not match the metadata label list length.
  - First seen done in `docs/planning/TODO.md` at commit `ebae288` (docs: add repeatable manual runtime smoke verification flow).
- [x] **Task:** Re-check every removed external snapshot file and record adaptation decisions in `docs/training/SIGNLANG_EXTERNAL_RECHECK_2026-03-23.md`; port additional reusable code where justified. _Done: added maintained sweep orchestration script `server/src/amyserver_tools/train_mlp_sweep.py`._
  - First seen done in `docs/planning/TODO.md` at commit `ebae288` (docs: add repeatable manual runtime smoke verification flow).
- [x] **Task:** **P1: Prototype worker offload for synchronous detection processing**
  - First seen done in `docs/planning/TODO.md` at commit `20c0e96` (Add config-driven MediaPipe confidence thresholds, injectable predictor in GestureDetectionStep, GestureModelAdapter interface, and DetectionWorker/WorkerDetectionBridge prototype with tests).
### 2026-03-27

- [x] **Task:** **APR-P0-2 (protocol):** Publish realistic device performance protocol (first launch, route switch, camera flip, 20-min run).
  - First seen done in `docs/planning/TODO.md` at commit `b28ed0e` (feat: deliver APR-P0-3 few-shot protocol, APR-P0-2 device perf protocol, JUN-P1-3 terminology gate).
- [x] **Task:** **APR-P0-3:** Create reproducible few-shot protocol doc with leakage-safe split contract.
  - First seen done in `docs/planning/TODO.md` at commit `b28ed0e` (feat: deliver APR-P0-3 few-shot protocol, APR-P0-2 device perf protocol, JUN-P1-3 terminology gate).
- [x] **Task:** **JUN-P1-3:** Establish terminology quality gate for sign-language wording (“Gebärde”) across user-visible copy.
  - First seen done in `docs/planning/TODO.md` at commit `b28ed0e` (feat: deliver APR-P0-3 few-shot protocol, APR-P0-2 device perf protocol, JUN-P1-3 terminology gate).
- [x] **Task:** **APR-P0-2 (CI baseline):** Run first performance measurement cycle (server + webapp, CI runner).
  - First seen done in `docs/planning/TODO.md` at commit `350dc5d` (feat: add dev CORS middleware and performance benchmark report).
### 2026-03-28

- [x] **Task:** **MAY-P0-2:** Add few-shot parser/aggregation tests and strict schema checks.
  - First seen done in `docs/planning/TODO.md` at commit `52ba4d4` (chore(server): refresh global model artifact).
- [x] **Task:** **MAY-P0-2:** Added few-shot parser/aggregation tests with strict metric-schema failures.
  - First seen done in `docs/planning/TODO.md` at commit `52ba4d4` (chore(server): refresh global model artifact).
- [x] **Task:** **JUN-P1-2:** Established recurring manual accessibility verification cadence and completed first cycle.
  - First seen done in `docs/planning/TODO.md` at commit `52ba4d4` (chore(server): refresh global model artifact).
- [x] **Task:** **JUN-P1-1:** Expanded operations runbook with incident drill and rollback evidence.
  - First seen done in `docs/planning/TODO.md` at commit `52ba4d4` (chore(server): refresh global model artifact).
- [x] **Task:** **JUL-P2-2:** Published governance cadence with ownership and reusable evidence templates.
  - First seen done in `docs/planning/TODO.md` at commit `52ba4d4` (chore(server): refresh global model artifact).
- [x] **Task:** **JUL-P1-2:** Documented production health monitoring ownership and threshold policy.
  - First seen done in `docs/planning/TODO.md` at commit `52ba4d4` (chore(server): refresh global model artifact).

- Total recovered done entries: **192**.

<!-- AUTO-GENERATED-DONE-HISTORY:END -->
