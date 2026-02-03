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

## AI Blind Spot Analysis — Open Items (2026-02-03)

The following items were identified during an AI blind spot analysis. They represent gaps found by cross-referencing security audits, testing strategy documentation, and recommended enhancements that were not previously tracked in this TODO.

### Security Hardening (from Security Audit)
_Reference: `docs/security/SECURITY_AUDIT_2026-02-02.md` and `docs/security/README.md`_

- [ ] **HTTPS Enforcement**: Add middleware to reject non-HTTPS requests in production mode. Document HTTPS requirement for deployment.
- [ ] **HSTS Headers**: Configure Strict-Transport-Security headers for production deployments.
- [ ] **Audit Logging**: Implement audit logging for security-sensitive events (profile access, data deletion, authentication failures).
- [ ] **Refresh Token Rotation**: Implement refresh token rotation to limit token reuse after compromise.
- [ ] **Per-User Rate Limiting**: Extend rate limiting from IP-based to user-based for authenticated endpoints.
- [ ] **2FA Support**: Add two-factor authentication for sensitive caregiver operations (profile deletion, data export).
- [ ] **Database Migration**: Migrate from JSON file database to SQLite/PostgreSQL for production (JSON file unsuitable for concurrent access at scale).

### Dependency Security
_Reference: `npm audit` output showing 19 high severity vulnerabilities in server dependencies_

- [ ] **Fix AWS SDK Vulnerabilities**: Update `@aws-sdk/*` packages to resolve 19 high severity vulnerabilities related to `fast-xml-parser` DoS issue.
- [ ] **Add Dependency Scanning to CI**: Add automated `npm audit` or Snyk scanning to CI pipeline to catch vulnerabilities before deployment.

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
- [ ] **Performance under stress tests**: Test at 5% battery, 1% storage, and network flakiness.
- [ ] **Accessibility feature tests**: >90% coverage for accessibility (screen readers, high contrast, motor accessibility).

### Accessibility Testing
_Reference: `docs/accessibility/contrast-audit.md` — contrast fixed, but comprehensive a11y testing missing_

- [ ] **Screen Reader Testing**: Test full user flows with VoiceOver (iOS) and TalkBack (Android).
- [ ] **Keyboard Navigation**: Verify all interactive elements are keyboard-accessible.
- [ ] **Reduced Motion Support**: Respect `prefers-reduced-motion` for animations.
- [ ] **Cognitive Accessibility Review**: Ensure all error messages and guidance are child-friendly and non-judgmental.

### CI/CD Enhancements
_Reference: `.github/workflows/ci.yml` — current CI runs tests but lacks security scanning_

- [ ] **Add CodeQL Scanning Workflow**: Create dedicated workflow for CodeQL static analysis on PRs.
- [ ] **Dependency Vulnerability Scanning**: Add `npm audit` or Dependabot integration to CI.
- [ ] **Security Test Suite in CI**: Run `profileAuthorization.test.ts` and `securityVulnerabilities.test.ts` as blocking checks.

### Production Readiness
_Reference: Various audit documents and deployment guides_

- [ ] **Health Check Endpoint Enhancement**: Add detailed health checks for database connectivity, model availability, and Python dependencies.
- [ ] **Graceful Shutdown**: Implement graceful shutdown with request draining for zero-downtime deployments.
- [ ] **Environment Variable Validation**: Add startup validation for all required environment variables with clear error messages.
- [ ] **Production Logging**: Implement structured JSON logging for production with log levels (info, warn, error).

### Documentation Gaps
_Reference: Identified through cross-referencing docs with actual implementation_

- [ ] **Deployment Runbook**: Create step-by-step production deployment runbook with pre/post checks.
- [ ] **Incident Response Guide**: Document how to handle common incidents (database corruption, auth bypass attempts, model training failures).
- [ ] **Performance Baseline Documentation**: Document expected performance metrics (inference latency, upload speed, training time) for SLA monitoring.

---

**Note:** This blind spot analysis was performed on 2026-02-03 by examining security audit reports, testing strategy documentation, CI workflows, and recommended enhancements from `docs/security/README.md`. Items should be prioritized based on production deployment timeline.
