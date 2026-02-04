# Amy's Echo Sign Language Model — Training & Recognition

## Open Follow-ups
- [x] Ship a kid-focused, production-ready DGS baseline model: curate the starter vocabulary (colors, food, caregiver phrases), train a balanced multimodal model, and place the resulting `data/amy_model.npz` under `server/data/models/global/` with a recorded SHA256 checksum so deploys always carry working weights. (Baseline artifact + checksum committed, kid starter preset in `server/data/config/kid_starter_preset.json`.)
- [x] **Finalize quality gates for user-generated training data:** define per-sign minimums, jitter thresholds for hand/pose/face stability, and review steps before promoting caregiver uploads into the global baseline. (Thresholds in `server/src/constants/trainingQuality.ts`, documented in `docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`.)
- [x] Close the multimodal feedback loop in production: validate that camera overlay previews (hands + pose + face) match what the server ingests, confirm smoothing/feature metadata is preserved through training, and add an E2E checklist for “record → preview → upload → train → download personalized model”. (Checklist in `docs/operations/PRODUCTION_TRAINING_CHECKLIST.md`.)

## MediaPipe Blind-Spot Follow-ups (Client, Server, Data, Infra)

### Client (app)
- [x] Define a **landmark confidence policy**: thresholds for visibility, minimum frames per window, and how to handle dropped frames (e.g., interpolate vs. discard).
- [x] Implement **landmark normalization** (hand size, body-relative coordinates) with a documented formula and unit tests.
- [x] Prototype **Holistic vs. Hands-only** performance on target devices and document FPS/thermal impact.
- [x] Add **non-manual feature extraction** from Face Mesh and Pose (e.g., eyebrow raise, head pitch/yaw, mouth openness) and measure incremental accuracy lift.
- [x] Define a **client payload schema** for streamed landmarks (JSON or protobuf) including timestamps, handedness, visibility, and schema version.

### Server
- [x] Specify **windowing strategy** (window length, stride) and alignment method (CTC vs. seq2seq) for gesture + language modeling.
- [x] Implement **temporal smoothing** and jitter reduction for incoming landmark sequences.
- [x] Add **re-init logic** when landmark confidence drops (request a keyframe or reset state).
- [x] Define **response format** including per-token timestamps, confidence scores, and error codes.

### Data & evaluation
- [x] Identify or build a **sign-language dataset** that includes non-manual markers; document label format and split strategy.
- [x] Define **evaluation metrics** (WER, gloss accuracy, latency, FPS) and add a baseline report template.

### Infra & monitoring
- [x] Add **bandwidth/latency budgets** and validate end-to-end streaming limits in staging.
- [x] Instrument **server inference latency** and **client capture FPS** with logging/metrics dashboards.

We have MediaPipe capture working in the webapp and a Python MLP trainer on the server. The training flow enables new caregiver recordings to refresh the sign language recognition model (globally and per profile) with automatic model distribution.

## 1. Capture Sign Language Samples in the Webapp (`webapp/`)
- [x] Upgrade the sign language detector (`webapp/src/gesture/`) to stream a rolling buffer of frames alongside the existing landmark payload.
- [x] Extend the Training page to record both the landmark timeline and captured frames while recording is active.
- [x] Persist the sample shape in the training queue (`webapp/src/training/trainingQueue.ts`). Use IndexedDB via OPFS for offline support.
- [x] Harden multimodal capture for kids: verify pose/face/hand landmark availability across supported browsers/devices, and surface guidance when a modality drops (e.g., "Please keep face in frame").
- [x] Add privacy-safe preview controls: allow caregivers to toggle raw video vs. skeleton-only while keeping overlay drawing for hands/pose/face visible.

## 2. Package & Queue Upload Bundles (`webapp/src/training`)
- [x] Create `uploadTrainingBundle` that builds a zip with `{metadata.json, landmarks.json, still.jpg}`.
- [x] Store pending bundles in IndexedDB. Flush them through the training uploader hook as soon as connectivity is available.
- [x] Add unit coverage that mocks the queue and asserts the zip payload structure.
- [x] Ensure multimodal bundle fidelity: confirm `metadata.json` and `landmarks.json` keep pose/face features, handedness, smoothing params, and add regression tests that fail if fields are dropped.

## 3. Ingest Sign Language Training Bundles on the Server (`server/`)
- [x] Implement `/api/v1/dgs/sample-bundles` in `server/src/server.ts` that accepts multipart uploads. Save bundles under `data/uploads/<profileId>/<timestamp>/`, reject bundles missing `landmarks.json` with HTTP 400 after cleaning up, and register successful uploads in `data/datasets/training_manifest.json`.
- [x] Write integration tests in `server/test/trainingBundles.test.ts` that POST a fixture zip and assert the manifest entry.
- [x] Mirror client bundle richness: validate that ingested samples persist pose/face landmarks, derived features (e.g., lip-pointing distance), smoothing metadata, and consent/license details into dataset manifests without dropping fields.
- [x] Add ingestion-level analytics: log counts of missing modalities, rejected bundles, and per-profile coverage so we can spot shaky cameras or poor lighting before training.

## 4. Retrain the Sign Language Recognition Model with Bundle Data (`server/src/amyserver_tools`)
- [x] Extend `train_mlp.py` to load from `training_manifest.json`, extracting landmarks either from `landmarks.json` or by running MediaPipe on the stored clip. Cache extracted landmarks back to `data/uploads/.../landmarks_cached.json`.
- [x] Produce both global (`data/models/global/amy_model.npz`) and per-profile weights (`data/models/<profileId>/amy_model.npz`).
- [x] Emit a structured training report (JSON) that `/train-model` returns.
- [x] Promote multimodal training: add pose/face inputs and non-manual features to the trainer, support modality dropout (natural via zero-filling), and implement multimodal data augmentation.
- [x] Benchmark accuracy vs. current hand-only MLP: collect metrics on multimodal vs. hand-only performance. _See `docs/testing/benchmarks/multimodal_vs_handonly_report.md` for the current benchmark snapshot._
- [x] Provide a "kid starter" training preset: pre-load the trainer with core DGS glosses, class weights, and data splits that reflect the curated vocabulary. _See `server/data/config/kid_starter_preset.json`._

## 5. Distribute Updated Sign Language Models Back to the Webapp
- [x] Expand `server/src/server.ts`'s `/latest-mlp-model` handler to accept `?profileId=` and serve personalized bundles when available; fall back to the global model otherwise.
- [x] Update the webapp model client (`webapp/src/gesture/modelClient.ts`) to request the personalized model first.
- [x] Notify users when a newer model version is loaded.
- [x] Surface modality coverage and training version in model headers so caregivers know they are using the multimodal DGS model without forcing additional language tags.

## 6. Verify & Document the Sign Language Training Loop
- [x] Add end-to-end tests: one in `integration/` that records a fake sign, uploads it, triggers `/train-model`, downloads the new weights, and asserts the model file checksum changes.
- [x] Document the flow in `docs/` with a sequence diagram (capture → bundle → training → distribution).
- [x] Create a manual QA checklist covering "record sign", "bundle files present", "training job succeeds", "personalized model downloaded".
- [x] Extend manual and automated QA for multimodal overlays: include steps/screenshots showing landmark previews (hand/pose/face), expected German guidance when modalities are missing, and the end-to-end path from preview to personalized model download.
- [x] Track latency and reliability: add metrics collection for capture → upload → training → download timings, and publish a weekly dashboard to ensure the full cycle stays within the kid-friendly budget (<50 ms/frame inference, fast uploads on spotty connections). _See `docs/training/TRAINING_METRICS_DASHBOARD.md`._

---
**Status:** Core sign language training loop implemented. The system captures hand landmarks via MediaPipe, trains per-user and global MLP models for Deutsche Gebärdensprache (DGS) recognition, and automatically distributes updated models to all devices. Focus is now on optimization, production readiness, and establishing quality criteria for promoting user training data to the global baseline model.

## Additional Roadmap Items (Consolidated)

### Multimodal Audio + Gesture Recognition

#### Training Pipeline ✅ COMPLETE
- [x] Add audio capture service for recording speech during gesture capture
- [x] Integrate audio recording with training recorder (captures audio alongside video)
- [x] Update training bundle types to include audio files
- [x] Extend training bundle creation to package audio files in ZIP bundles
- [x] Update server-side bundle ingestion to handle audio files
- [x] Modify training manifest to track audio data
- [x] Add comprehensive unit tests for audio capture service (16 tests)
- [x] Create audio preprocessing utilities for format normalization
- [x] Update Python training tools to accept and process audio data
- [x] Audio features extracted and attached to training samples
- [x] Add integration tests for complete audio+gesture training flow (4 tests)
- [x] Implement multimodal fusion layer (concatenate audio + visual features)
- [x] Add zero-padding for samples without audio to maintain consistent dimensions
- [x] Update MLP input layer to handle combined feature dimensions
- [x] Document audio capture settings and troubleshooting

#### Live Recognition Pipeline ✅ COMPLETE
- [x] Create browser-based MFCC extraction service (Web Audio API)
- [x] Implement live audio recognition service for real-time capture
- [x] Extend `mlpPredict()` to accept audio features parameter
- [x] Add audio fusion logic in `installMlp.ts`
- [x] Create integration guide (`docs/LIVE_AUDIO_INTEGRATION_GUIDE.md`)
- [x] Integrate live audio service with `GestureRecognitionOrchestrator`
- [x] Wire up audio extraction in `handleGestureResults()`
- [x] Pass audio features to MLP in `GestureDetectionStep`
- [x] Add unit tests for live multimodal recognition
- [x] End-to-end validation with multimodal model

**Context:** Enable Amy to say words (e.g., "Iila" for purple) while signing, creating a richer multimodal recognition system that combines verbal utterances with sign language gestures.

**Training Status:** ✅ **COMPLETE** - Full multimodal fusion layer implemented! Audio features are now combined with visual features for unified MLP training. The system automatically uses multimodal input (48,883 dims) when audio is present, or visual-only (48,870 dims) when not. Zero-padding ensures consistent dimensions across all samples.

**Live Recognition Status:** ✅ **COMPLETE** - Full orchestrator integration implemented! Browser-based MFCC extraction and live audio service working. MLP prediction logic receives audio features. Audio extracted in real-time and passed through processing pipeline to MLP. All three learning scenarios (gesture-only, speech-only, both) now fully functional in live recognition!

### Custom Sign Workflow Enhancements
- [x] Add visual status indicators (registered, training, ready).
- [x] Auto-trigger model training after custom sign registration.
- [x] Show pending signs that need more training samples.
- [x] Add sign readiness percentage based on sample count and quality.
- [x] Background model updates for custom signs. _See `customGestureRegistry.ts` with `BACKGROUND_MODEL_UPDATE_EVENT` for automatic training triggers._
- [x] Offline queueing for uploads in the custom sign flow.
- [x] Training data quality metrics to decide when user-contributed data is ready for the global baseline. _See `docs/training/GLOBAL_BASELINE_PROMOTION_POLICY.md`._
- [x] Add search in the training screen for the labels.

### Metacom Integration
- [x] Define Metacom board schema and starter fixtures in the webapp.
- [x] Build an import pipeline for Metacom symbol/board bundles.
- [x] Build stable grid UI with Metacom categories, colors, and German labels.
- [x] Add migration strategy for existing boards with safe fallback behavior. _See `docs/metacom/METACOM_MIGRATION_STRATEGY.md`._
- [x] Validate licensing constraints and document approved symbol sets (Import durch Nutzer, keine mitgelieferten Symbole).

### Profile Identity & GDPR Follow-ups
- [x] Add profile registry database.
- [x] Implement profile deletion endpoint with cascade cleanup.
- [x] Add profile export with all associated training data.
- [x] Migrate to UUID-based profile IDs.
- [x] Add profile metadata storage (age, creation date, etc.).
- [x] Implement profile merge/transfer tooling.
- [x] Multi-device profile sync.
- [x] Profile sharing between caregivers.
- [x] Profile backup/restore automation.

---

## 🤖 IMPORTANT NOTE FOR AI AGENTS 🤖

**This TODO file contains two types of tasks:**

1. **Agent Tasks (marked with standard checkboxes)**: Tasks that AI agents can implement, test, and complete autonomously
2. **Human Tasks (in dedicated section below)**: Tasks requiring human judgment, physical device testing, manual reviews, or deployment decisions

**AI agents should:**
- ✅ Work on agent tasks that involve code implementation, testing, documentation, and automation
- ❌ Skip human tasks - these require manual intervention, physical testing, or human decision-making
- 📋 Move completed agent tasks to the appropriate section when done

---

## AI Blind Spot Analysis — Open Items (2026-02-03)

The following items were identified during an AI blind spot analysis. They represent gaps found by cross-referencing security audits, testing strategy documentation, and recommended enhancements that were not previously tracked in this TODO.

### Security Hardening (from Security Audit)
_Reference: `docs/security/SECURITY_AUDIT_2026-02-02.md` and `docs/security/README.md`_

- [ ] **HTTPS Enforcement**: Add middleware to reject non-HTTPS requests in production mode. Document HTTPS requirement for deployment.
- [ ] **HSTS Headers**: Configure Strict-Transport-Security headers for production deployments.
- [ ] **Audit Logging**: Implement audit logging for security-sensitive events (profile access, data deletion, authentication failures).
- [ ] **Refresh Token Rotation**: Implement refresh token rotation to limit token reuse after compromise.
- [ ] **Per-User Rate Limiting**: Extend rate limiting from IP-based to user-based for authenticated endpoints.

**Note:** Security decisions requiring human authorization (2FA support, database migration, HTTPS deployment configuration) moved to Human Tasks section.

### Dependency Security
_Reference: `npm audit` output showing 20 vulnerabilities in server dependencies_

- [x] ~~**Fix AWS SDK Vulnerabilities**~~: ❌ **FALSE POSITIVE** — AWS SDK is NOT directly used. The 19 high severity vulnerabilities from `@aws-sdk/*` are transitive dependencies of `@types/nodemailer` (TypeScript type definitions only). The actual nodemailer uses sendmail/SMTP transport, not AWS SES. These are dev-time type definitions that don't affect runtime. _Verified 2026-02-04 by checking `npm why @aws-sdk/client-sesv2` → comes from `@types/nodemailer@7.0.5`._
- [x] **Fix diff/jsdiff Vulnerability**: ✅ **FIXED** — Updated `diff` package to resolve DoS vulnerability in parsePatch/applyPatch (GHSA-73rr-hh4g-fpgx). Fixed via `npm audit fix`. All server vulnerabilities resolved. _Fixed 2026-02-04._
- [x] **Add Dependency Scanning to CI**: ✅ **IMPLEMENTED** — Added automated `npm audit` checks to CI pipeline for webapp, server, and integration packages with high severity threshold. _Implemented 2026-02-04._
- [ ] **Consider Replacing @types/nodemailer**: The AWS SDK bloat from `@types/nodemailer` adds ~60+ packages for type definitions we don't fully use. Consider using minimal type definitions or contributing to DefinitelyTyped to make AWS SES types optional.

### Testing Coverage Goals (from Testing Strategy)
_Reference: `docs/testing/TESTING_STRATEGY.md` — P0/P1 items not yet implemented_

#### Critical Communication Paths (P0)
- [ ] **Emergency gesture detection tests**: Achieve 100% coverage for "hilfe" gesture detection within 50ms threshold.
- [ ] **Gesture history & replay tests**: Full coverage for storing/replaying last 10 gestures with audio.
- [ ] **Automatic recovery system tests**: Test that gesture pipeline recovers from crashes without user intervention.
- [ ] **Zero-downtime model update tests**: Verify communication continues during model updates.
- [ ] **Pre-cached responses tests**: Ensure offline mode uses cached responses correctly.

#### Core Functionality (P1)
- [ ] **Gesture recognition accuracy tests**: Achieve >90% test coverage for recognition accuracy.
- [ ] **Error handling tests**: >85% coverage for error scenarios (network failures, camera errors, etc.).

### Accessibility Testing
_Reference: `docs/accessibility/contrast-audit.md` — contrast fixed, automated tests needed_

- [ ] **Automated Accessibility Tests**: Add automated tests for WCAG compliance (color contrast, ARIA labels, semantic HTML).
- [ ] **Focus Management Tests**: Automated tests for focus trapping in modals and proper focus order.
- [ ] **High Contrast Mode Tests**: Automated visual regression tests for high contrast mode.

**Note:** Manual accessibility testing (screen readers, keyboard navigation, cognitive accessibility) moved to Human Tasks section.

### CI/CD Enhancements
_Reference: `.github/workflows/ci.yml` — current CI runs tests but lacks security scanning_

- [x] **Add CodeQL Scanning Workflow**: ✅ **IMPLEMENTED** — Created `.github/workflows/codeql.yml` with security-extended queries for JavaScript and Python. Runs on PRs, pushes to main, and weekly scheduled scans. _Implemented 2026-02-04._
- [x] **Dependency Vulnerability Scanning**: ✅ **IMPLEMENTED** — Added `npm audit` checks to main CI workflow. See also "Add Dependency Scanning to CI" above. _Implemented 2026-02-04._
- [x] **Security Test Suite in CI**: ✅ **VERIFIED** — `profileAuthorization.test.ts` and `securityVulnerabilities.test.ts` already run as part of main CI test suite via `full-check.sh`. _Verified 2026-02-04._

### Production Readiness
_Reference: Various audit documents and deployment guides_

- [x] **Health Check Endpoint Enhancement**: ✅ **IMPLEMENTED** — Enhanced `/health` and `/api/v1/health` endpoints with detailed checks for database connectivity, global model availability, Python dependencies (numpy, sklearn, mediapipe), and training manifest accessibility. Returns overall system status (ok/degraded) with timestamp and detailed check results. Added comprehensive test coverage. _Implemented 2026-02-04._
- [x] **Production Logging**: ✅ **VERIFIED** — Structured JSON logging already implemented in `logger.ts`. Outputs JSON in production mode, human-readable in development. Supports log levels (ERROR, WARN, INFO, DEBUG), context tracking (userId, requestId, duration), and specialized logging methods for different operations (API requests, database ops, gesture processing, training, etc.). _Verified 2026-02-04._

**Note:** Deployment management and environment validation tasks moved to Human Tasks section.

### Documentation Gaps
_Reference: Identified through cross-referencing docs with actual implementation_

- [x] **API Documentation**: ✅ **EXPANDED** — Comprehensive update to `docs/integration/API.md` with detailed request/response examples, HTTP status codes, error codes table, validation requirements, rate limiting details, and examples for all endpoints including authentication, profiles, samples, training, and model serving. _Updated 2026-02-04._
- [x] **Architecture Decision Records**: ✅ **CREATED** — Created `docs/architecture/ADR.md` documenting 10 key architectural decisions: Hybrid-First Architecture, JWT Authentication, MLP for Gesture Recognition, MediaPipe Integration, IndexedDB Storage, JSON File Database, German-First UI, Multimodal Input, Rate Limiting Strategy, and CodeQL Security Scanning. Each ADR includes context, rationale, consequences, and alternatives considered. _Created 2026-02-04._

**Note:** Deployment runbooks, incident response guides, and performance baseline documentation moved to Human Tasks section (require operational experience and production access).

---

**Note:** This blind spot analysis was performed on 2026-02-03 by examining security audit reports, testing strategy documentation, CI workflows, and recommended enhancements from `docs/security/README.md`. Items should be prioritized based on production deployment timeline.

---

## 👥 HUMAN TASKS (Manual Intervention Required)

**⚠️ AI AGENTS: DO NOT WORK ON THESE TASKS ⚠️**

The following tasks require human judgment, physical device testing, manual reviews, or deployment decisions. These cannot be automated and must be completed by human contributors.

### Manual Testing & Validation

#### Accessibility Testing (Requires Physical Devices)
- [ ] **Screen Reader Testing**: Test full user flows with VoiceOver (iOS) and TalkBack (Android) on physical devices
- [ ] **Keyboard Navigation**: Manually verify all interactive elements are keyboard-accessible across browsers
- [ ] **Cognitive Accessibility Review**: Ensure all error messages and guidance are child-friendly and non-judgmental (requires human judgment with target users)
- [ ] **Reduced Motion Support**: Test `prefers-reduced-motion` behavior on actual devices with reduced motion settings enabled

#### Device & Environment Testing
- [ ] **Performance under stress tests**: Manually test at 5% battery, 1% storage, and network flakiness on physical devices
- [ ] **Real-world device testing**: Test gesture recognition accuracy on target devices (tablets, phones) in real-world conditions
- [ ] **Camera/lighting validation**: Test MediaPipe capture under various lighting conditions and camera angles
- [ ] **Offline mode validation**: Manually verify communication continues when network is completely unavailable

### Production Deployment & Operations

#### Deployment Management (Requires Human Decision-Making)
- [ ] **Deployment Runbook**: Create step-by-step production deployment runbook with pre/post checks (requires infrastructure knowledge)
- [ ] **Incident Response Guide**: Document how to handle common incidents (requires operational experience and human judgment)
- [ ] **Environment Variable Validation**: Review and validate all required environment variables for production (requires access to production secrets)
- [ ] **Graceful Shutdown Testing**: Manually test graceful shutdown with request draining on staging environment before production rollout

#### Security Decisions (Requires Human Authorization)
- [ ] **2FA Support Decision**: Decide whether to implement two-factor authentication for caregiver operations (requires product/security review)
- [ ] **Database Migration Decision**: Evaluate and decide on migration from JSON file database to SQLite/PostgreSQL (requires infrastructure planning)
- [ ] **Audit Logging Review**: Define which security-sensitive events should be logged (requires security team input)
- [ ] **HTTPS Deployment Configuration**: Configure HTTPS and HSTS headers on production infrastructure (requires DevOps access)

### Documentation Review & Decisions

#### Content Reviews (Requires Domain Expertise)
- [ ] **Performance Baseline Documentation**: Document expected performance metrics based on real production data (requires production monitoring access)
- [ ] **Training Quality Review**: Review real user-contributed training data quality before promoting to global baseline (requires human judgment)
- [ ] **Metacom Licensing Validation**: Validate licensing constraints and document approved symbol sets (requires legal review)

### Continuous Monitoring (Ongoing Human Tasks)

#### Manual Checkpoints
- [ ] **Weekly Manual QA**: Run manual QA checklist covering "record sign", "bundle files present", "training job succeeds", "personalized model downloaded" on staging environment
- [ ] **Monthly Security Review**: Review `npm audit` output and security scan results, make decisions on which vulnerabilities to address
- [ ] **Quarterly Accessibility Audit**: Conduct accessibility testing with actual users (children with communication needs and caregivers)
- [ ] **Production Health Monitoring**: Monitor production dashboards for performance degradation, unusual patterns, or errors requiring human intervention

---

**Last Updated:** 2026-02-04
