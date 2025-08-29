# AmysEcho Development Action Plan
*Updated roadmap incorporating PR #349 and WebView + MediaPipe architecture*

## LLM Task Board
- [x] Audit app UI strings for German language compliance (`app/src/`)
- [x] Run `npx expo install --check` in `app/` and update any flagged dependencies
- [x] Run `npx expo-doctor` in `app/` once network access is available
- [x] Enqueue `python3 src/amyserver_tools/train_mlp.py` after centroid updates in `/train-model`
- [x] Track MLP training progress in `trainingJobs` and expose via `/train-status`
- [x] Persist `.npz` models under `data/`, copying to `dgs_model_<profileId>.npz` when applicable
- [x] Add unit tests ensuring MLP training runs and creates model files
 - [x] Enforce per-profile authorization on `/latest-mlp-model` (403 on unauthorized access; non-enumerable errors)
 - [x] Write models atomically (temp file + rename) and serve with `ETag` + `X-Model-Version`
- [x] Review TTS de-duplication window and make it configurable (see `SpeechDeduplicationLearnings.md`)
- [x] Reevaluate LanguageManager to simplify localization and allow additional languages (see `LocalizationLearnings.md`)
- [x] Address gesture training blind spot tasks (see section below)

## Gesture Training Blind Spot Tasks
*For Amy – voku/AmysEcho*

- [x] Preserve handedness when saving training samples (`app/src/components/MediaPipeGestureDetector.tsx`, `app/src/services/dgsTrainingService.ts`)
- [x] Flatten DGS samples before POST (`app/src/services/dgsTrainingService.ts`)
- [x] Align MLP label storage with WebView (`server/src/amyserver_tools/train_mlp.py`, `app/src/webview/installMlp.ts`)
- [x] Unify landmark normalization algorithms (`app/src/services/landmarkNormalizer.ts`, `app/src/webview/installMlp.ts`, `server/src/amyserver_tools/train_mlp.py`, `server/src/services/dgsModelService.ts`)
- [x] Report basic training metrics


## Current Architecture Status
✅ **WebView + MediaPipe Integration Complete** (as of 2025-08-21)
- Hand landmark extraction via MediaPipe in WebView
- On-device gesture classification via MediaPipe Tasks JS (CDN), with simple rule-based assist
- Training/recognition workflow operational
- Documentation updated in `docs/ExpoGestureRecognition.md`
- Server persists and serves centroid models per child profile via `profileId`
## MLP Model Training & App Integration Plan
1. **Collect samples** – record 21/42 landmark arrays and upload via `/train-model` with an optional `profileId`.
2. **Run training** – server updates centroids, then spawns `python3 src/amyserver_tools/train_mlp.py` and streams JSON progress.
3. **Monitor status** – client polls `/train-status` until `progress` reaches 100.
   - Server returns `202 Accepted` while training, `200 OK` when done, and appropriate `4xx/5xx` on errors.
   - Client polling uses exponential backoff (e.g., 0.5 s → 1 s → 2 s, capped at 5 s).
4. **Persist models** – training writes `data/dgs_model.npz` and copies `data/dgs_model_<profileId>.npz` when a profile is supplied.
   - Atomic write: save to a temp file then rename to avoid partial reads.
   - Paths: always use `getMlpModelPath(profileId?)`; disallow user-provided filenames; validate `profileId`.
   - Permissions: set files to `0640` owned by the serving user.
5. **Download weights** – app requests `/latest-mlp-model` (optionally with `profileId`) and stores the `.npz` file locally.
   - Authorization: include standard auth token; server verifies caller's rights and returns `403` without revealing profile existence.
   - Headers: `Content-Type: application/octet-stream`, `Content-Disposition: attachment; filename="dgs_model[_<profileId>].npz"`.
   - Caching & integrity: support `ETag`/`Cache-Control`, `X-Model-Version`, and `X-Checksum-SHA256`; app verifies before use.
   - Range requests: allow `Range` for resume; respond `404` when no model exists.
6. **Parse `.npz`** – implement a lightweight NPZ parser to extract weight matrices and bias vectors.
   - Safety: enforce max file size (≤5 MB), bounded entry counts, and expected tensor shapes.
7. **Run inference** – execute the MLP forward pass on normalized landmarks within the WebView and map outputs to gesture labels.
8. **Fallback strategy** – if loading fails, fall back to centroid or rule-based classification while logging an error for caregivers.
9. **Version checks** – compare model versions (`ETag`/`X-Model-Version`) and refresh only when changed to avoid clock drift.
10. **End-to-end test** – train with real samples, download the model, and verify app predictions on-device.
11. **Server integration details**
    - Enqueue a child process `python3 src/amyserver_tools/train_mlp.py` once centroid updates succeed.
    - Capture training progress and status in `trainingJobs` so clients can poll `/train-status`.
    - Persist the resulting `.npz` under `data/` and copy to `data/dgs_model_<profileId>.npz` when `profileId` is provided.
    - Add tests:
      - [x] Uploading samples triggers MLP training and creates model files.
      - [x] `/latest-mlp-model` returns 200 for an authorized owner, 403 for unauthorized access, and 404 when no model exists.
      - [x] `/latest-mlp-model` sets `ETag`, `X-Checksum-SHA256` and `X-Model-Version` headers.
12. **App wiring** – extend `MediaPipeGestureDetector.tsx` to fetch `/latest-mlp-model`, parse `.npz` weights, and run the MLP forward pass with centroid or rule-based fallback.

## Immediate Next Steps

- [x] **Test App/Server Integration & Document Setup**
  - [x] Test the full app/server integration, ensuring correct data flow and authentication. See [`AppServerIntegrationGuide.md`](AppServerIntegrationGuide.md).
  - [x] Document proper startup procedure for both server (with `API_TOKEN=demo-token npm start --prefix server`) and app (`./scripts/dev-run.sh`).
  - [x] Verify training data upload from app to server.
  - [x] Verify model metadata and model download from server to app.
  - [x] Confirm resolution of `training sync failed` and `model metadata request failed` errors.

- [x] **Fix "Teach New Gesture" WebView**
  - Fix the black WebView issue in the 'Teach New Gesture' screen (`app/src/screens/TeachingScreen.tsx`).
  - Adapt the working WebView code from `RecognitionScreen.tsx` (`MediaPipeGestureDetector.tsx`).
  - Ensure camera feed is visible and landmark detection is active.
  - Verify that recorded samples are correctly captured and sent to the server.

- [x] **Revert MediaPipeGestureDetector.tsx to working state and re-integrate MLP/Centroid logic**
  - The `MediaPipeGestureDetector.tsx` file is currently reverted to a known working state (`baf462a23ea3aca54caace5354ac4091e38eabe3`) to ensure WebView functionality. This task involves carefully re-integrating the newer MLP model loading and centroid-based classification logic into this file. Ensure the camera feed remains visible, landmark detection is active, and the new classification pipeline is fully functional. Also, verify that the `TeachingScreen.tsx` WebView also works correctly after these changes.

## Now: Android USB Device Runbook
*Quick steps to validate on a real device connected via USB*

- Device detection: `adb devices` shows the phone.
- App: `npm run android --prefix app`.
  - No backend or `adb reverse` required for gesture recognition.
- Smoke test: permit camera; perform a thumbs‑up; expect status change + audio/visual feedback; optionally toggle network to confirm on-device recognition keeps working.

Troubleshooting
- Black/white preview: ensure camera permission is granted; restart app.
- First-load latency: initial CDN load may take a moment on slow networks; assets are cached by the WebView.

## Phase 1: User Experience & Stability (Weeks 1-2)
*Focus on child-centric reliability and error resilience*

### 1.1 User-Friendly Error Shielding
**Priority: Critical - Child Safety First**
- ✅ **Implement centralized error boundary system**
  - ✅ Create child-safe error messages with gentle visual feedback
  - ✅ Replace all technical errors with age-appropriate responses
  - ✅ Add automatic recovery mechanisms that don't require adult intervention
  - ✅ Log detailed errors for developers while showing simple "try again" prompts to Amy
- **WebView-to-React Native error bridge**
  - ✅ Catch MediaPipe failures gracefully in WebView
  - ✅ Implement seamless fallback to rule-based classifier
  - ✅ Add visual indicators when offline mode is active (without alarming the child)
- **Network resilience patterns**
  - ✅ Handle server classification timeouts elegantly
  - ✅ Implement progressive degradation (server → WebView fallback → encouraging gesture retry)
  - ✅ Add connection status awareness without technical complexity for users

### 1.2 HIP 4 Proactive Practice Implementation
**Priority: High - Learning Continuity**
- **Health score-based practice prompts**
  - ✅ Design non-blocking banner UI for practice suggestions
  - ✅ Implement gentle nudges when gesture `healthScore` falls below threshold
  - ✅ Implement caregiver-friendly scheduling for practice sessions
  - ✅ Add simple gamification (celebration feedback) after sessions
- **Practice session workflow**
  - ✅ Build guided practice interface with immediate feedback
  - ✅ Implement progress tracking and basic rewards
  - ✅ Add session length controls (3/5/8 samples)
  - ✅ Extend caregiver dashboard with summary + insights

### 1.3 Enhanced Telemetry for Usage Insights
**Priority: Medium - Data-Driven Improvements**
- **HIP event tracking system**
  - ✅ Log key interactions across HIP 1-4 workflows (onboarding, practice samples, correction open/submit)
  - ✅ Track gesture recognition success/failure patterns
  - ✅ Monitor practice session completion (local logs) and engagement (sessions)
  - ✅ Privacy-compliant telemetry upload (buffered, best-effort, token auth)
- **Health score trend analysis**
  - Implement historical tracking of gesture proficiency
  - Add alerts for declining recognition accuracy
  - Create caregiver reports on learning progress
  - Build predictive models for optimal practice timing

## Phase 2: Core Functionality Implementation (Weeks 3-5)
*Deliver the primary gesture recognition capabilities*

### 2.1 ML Pipeline Activation
**Priority: Critical**
- **Finalize on-device classifier integration**
  - ✅ Remove server dependency for recognition
  - ✅ Strengthen on-device rule-based assist with performance telemetry
  - ✅ Add confidence thresholding and uncertainty handling
- **Gesture classification pipeline**
  - ✅ Implement real-time classification with smoothing (confidence + label)
  - Add gesture sequence recognition for complex signs

### 2.2 Audio-Visual Feedback System
**Priority: High**
- **Rich feedback implementation**
  - Complete audioService.ts with contextual sound design
  - Implement visual confirmation system with accessibility support
  - Add haptic feedback for tactile confirmation
- **DGS video integration**
  - ✅ Complete video playback system for learning mode (DgsVideoPlayer)
  - ✅ Implement gesture demonstration in practice/training flow
  - Add simplified video controls optimized for child interaction

### 2.3 Core User Flows (HIP Protocol)
**Priority: High**
- **HIP 1: Onboarding flow completion**
  - Implement consent and setup with child-friendly UI
  - Add parent/caregiver configuration options
  - Create accessibility-first interaction patterns
- **HIP 3: Correction flow implementation**
  - Build "Help Me" repair interface
  - Implement correction logging for model improvement
  - Add gentle feedback for incorrect recognition
  - ✅ Log HIP 3 events and provide encouragement cues

## Phase 3: Advanced Features & Optimization (Weeks 6-7)
*Build sophisticated learning and interaction capabilities*

### 3.1 WebView + MediaPipe Performance Optimization
**Priority: Medium - Technical Excellence**
- **Landmark extraction efficiency**
  - Optimize MediaPipe processing for mobile devices
  - Implement adaptive quality settings based on device performance
  - Add frame rate throttling during low battery or thermal conditions
  - Create memory management for sustained WebView operations

### 3.2 Enhanced User Experience Features
**Priority: Medium - User Delight**
- **Rich audio-visual feedback expansion**
  - Add contextual celebration animations for successful gestures
  - Implement ambient sound design that responds to Amy's mood and energy
  - Create visual themes that can be customized by caregivers
  - Add haptic feedback patterns that reinforce learning
- **Multi-modal interaction support**
  - Implement voice commands for navigation assistance
  - Add switch/button accessibility options for motor limitations
  - Create eye-gaze support for alternative interaction methods
  - Build customizable UI layouts for different accessibility needs

### 3.3 Caregiver Tools and Analytics
**Priority: Medium - Family Support**
- **Advanced caregiver dashboard**
  - Create detailed progress reports with visual charts
  - Add comparative analysis with typical development milestones
  - Implement goal-setting and tracking tools
  - Build export functionality for sharing with therapists and educators
- **Collaborative learning features**
  - Add multi-user support for family members
  - Create shared gesture libraries between family devices
  - Implement progress sharing with permission controls
  - Build communication bridge with speech therapists and educators

## Phase 4: Production Excellence & Scale Preparation (Weeks 8-10)
*Ensure production readiness and sustainable operation*

### 4.1 Security & Privacy Excellence
**Priority: Critical - Child Protection**
- **Comprehensive data protection audit**
  - Implement end-to-end encryption for all gesture data
  - Add COPPA-compliant privacy controls and consent management
  - Create data retention policies with automatic expiration
  - Build secure key management for model encryption
- **Network security hardening**
  - Implement certificate pinning for all server communications
  - Add request signing and validation for API calls
  - Create secure model download verification
  - Build intrusion detection for suspicious usage patterns

### 4.2 Scalability & Performance
**Priority: High - Sustainable Growth**
- **Server infrastructure optimization**
  - Implement auto-scaling for gesture classification endpoints
  - Add CDN distribution for model downloads
  - Create database optimization for learning loop data
  - Build monitoring and alerting for service health
- **Mobile performance optimization**
  - Optimize WebView memory usage for extended sessions
  - Implement efficient gesture history management
  - Add intelligent preloading of frequently used models
  - Create background processing optimization for battery life

### 4.3 Production Deployment & Monitoring
**Priority: High - Operational Excellence**
- **Deployment pipeline completion**
  - Finalize iOS and Android release configurations
  - Implement automated testing including gesture recognition accuracy
  - Add crash reporting with privacy-safe error collection
  - Create staged rollout system for updates
- **Operational monitoring**
  - Build comprehensive health monitoring dashboard
  - Add real-time alerting for critical system failures
  - Create user experience monitoring with success rate tracking
  - Implement cost monitoring and optimization for cloud services

## Implementation Priority Matrix

### Immediate Sprint (Next 2 Weeks)
| Task | Impact | Effort | Priority |
|------|--------|--------|----------|
| User-friendly error shielding | Critical | Medium | **P0** |
| HIP 4 practice flow | High | Medium | **P1** |
| Enhanced telemetry | Medium | Low | **P1** |
| WebView error handling | High | Medium | **P1** |

### Developer Checks Before PRs
- Type safety: `npm run type-check --prefix app`
- App tests: `npm test --prefix app`
- Expo sanity: `(cd app && npx expo install --check)` and `(cd app && npx expo-doctor)`
- Server deps: `pip install -r server/requirements.txt`
- Server tests: `npm test --prefix server`
- Integration: `npm test --prefix integration`
- All-in-one: `./scripts/full-check.sh`

### Next Sprint (Weeks 3-4)
| Task | Impact | Effort | Priority |
|------|--------|--------|----------|
| Adaptive gesture suggestions | High | High | **P1** |
| Global learning loop foundation | High | High | **P1** |
| Server optimization | Medium | Medium | **P2** |
| Advanced analytics | Medium | Medium | **P2** |

### Future Sprints (Weeks 5-10)
| Task | Impact | Effort | Priority |
|------|--------|--------|----------|
| Multi-modal interaction | Medium | High | **P2** |
| Caregiver collaboration tools | Medium | High | **P2** |
| Security audit & hardening | Critical | Medium | **P1** |
| Production deployment | Critical | High | **P0** |

## Updated Success Metrics

### Technical Excellence KPIs
- **Error rate for children**: <0.1% user-visible errors during active use
- **Gesture recognition accuracy**: >95% for Amy's trained vocabulary
  - **System availability**: >99.9% uptime for core recognition features
- **Learning loop efficiency**: <24 hours from data collection to model improvement

### User Experience KPIs
- **Amy's engagement**: Daily voluntary usage sessions
- **Caregiver satisfaction**: >90% report communication improvement
- **Learning velocity**: Measurable vocabulary expansion week-over-week
- **Family adoption**: Multiple family members actively using suggestion features

### Platform Readiness KPIs
- **Privacy compliance**: 100% COPPA/GDPR adherence
- **Performance optimization**: <5% battery drain during active recognition
- **Scalability testing**: Support for 1000+ concurrent users
- **Documentation quality**: Zero blockers for new developer onboarding

## Architecture Integration Strategy

### WebView + MediaPipe Optimization
The current architecture using WebView for MediaPipe hand landmark extraction and on-device classification is solid but needs optimization:

- **Maintain WebView isolation** while improving React Native bridge communication
- **Rely on on-device classification via CDN-loaded Tasks Vision** (no server dependency)
- **Build upon existing training/recognition workflow** rather than rebuilding
- **Optimize for mobile constraints** while preserving accuracy

### Service Architecture Stability
Recent commits show recurring issues with React context and hooks. The updated plan addresses this by:

- **Focusing on error boundaries** rather than architectural rewrites
- **Implementing graceful degradation** when services fail
- **Centralizing error handling** to protect the child user experience
- **Maintaining existing service patterns** while hardening them

### Learning Loop Enhancement
The global learning loop represents the most ambitious technical challenge:

- **Privacy-first data collection** with granular consent controls
- **Automated model improvement** without manual intervention
- **Seamless deployment** of updated classifiers to all app instances
- **Performance monitoring** to ensure improvements don't degrade experience

## Risk Mitigation & Contingency Plans

### Child Safety Risks
- **Technical error exposure**: Comprehensive error shielding prevents Amy from seeing system failures
- **Privacy breaches**: End-to-end encryption and minimal data collection principles
- **Interaction frustration**: Graceful fallbacks ensure the app never "breaks" from a child's perspective

### Technical Implementation Risks
- **WebView performance**: Adaptive quality settings and memory management prevent crashes
- **Server dependencies**: Offline-first architecture ensures core functionality without network
- **Learning loop complexity**: Phased rollout with manual oversight before full automation

### Timeline & Scope Risks
- **Feature creep**: Strict prioritization matrix focuses on core gesture→understanding pipeline
- **Architecture changes**: Build upon existing WebView foundation rather than rebuilding
- **Third-party dependencies**: Minimal new dependencies, focus on optimizing current stack
