# Amy's Echo - Updated TODO List

## Current Status Summary
The project has a stable foundation after a major refactor. The database, navigation, and core app structure are complete. The next phase focuses on implementing scaffolded features to reach production readiness.

> Integration tests live under the repo's `integration/test` directory.

## Recognition Stabilization (TFLite, VisionCamera v4) — 2025-08
- ✅ Worklets correctness: 'worklet' directive + Worklets.createRunOnJS (no Reanimated runOnJS).
- ✅ Camera `pixelFormat="yuv"` for ML path.
- ✅ Backpressure: single in-flight inference; JS callbacks only on state change.
- ✅ One-time TFLite load; no per-frame allocations.
- ✅ Bounded, PII-free telemetry buffer; perf budget test.
- ⏭ (Optional) Move resize/convert into a VisionCamera frame processor plugin for zero-copy.

## 🔁 Enhancements & Extensions

1. [x] **Deterministic Builds & Version Freeze**
   - Pin all RN/Expo/WatermelonDB/VisionCamera/worklets-core dependencies to known-good versions.
   - Regenerate and commit a clean `package-lock.json` / `yarn.lock`.
   - Ensure CI builds only from tagged releases.
   - Export a dependency snapshot (`npm ls`, `gradle dependencies`) for reproducibility.

2. [x] **CI Pipeline Hardening**
   - Introduce a single entry script (`./scripts/full-check.sh`) to run type checks, unit tests, server tests, and integration tests.
   - Isolate or mark flaky tests and remove unconditional retries (allow only for infra-related flakes).
   - Treat any failed build as blocking.

3. [x] **Android / WSL2 Development Flow**
   - Add a reliable setup guide for USB debugging via `adb` / `usbipd` in WSL2.
   - Automate device checks (`expo doctor`, dev-client vs self-contained APK builds).
   - CI should produce both dev-client APK and full APK artifacts for manual field testing.

4. [x] **VisionCamera & Worklets Compatibility**
   - Lock to a tested combination of VisionCamera v4 and react-native-worklets-core.
   - Validate with real devices for both frame rate and recognition accuracy.
   - Document the performance budget in ms/frame.

5. [x] **Gesture Recognizer Hybrid Pipeline**
   - Implement a clear fallback matrix: Cloud inference when available, TFLite offline when not.
   - Add telemetry for each recognition: confidence score, latency, and inference path (cloud/offline).
   - Use this telemetry as a baseline for regression alerts.

6. [x] **Correction & Learning Flow**
   - “Help-Me” button should always store deterministic correction data with a re-prompt suggestion.
   - Capture negative samples and ambiguous gestures for retraining.
   - Ensure retraining actually improves accuracy (avoid polluting the dataset). (Note: This requires a robust validation process for the retraining pipeline.)

7. [x] **Offline Model Retraining**
   - Add reproducibility features to `server/dist/tools/retrainOfflineModel.js`: fixed random seeds, version tagging, and metrics (accuracy, top-k accuracy).
   - Version both the trained model (`offlineModel.json`) and the associated metrics (`metrics.json`).

8. [x] **Analytics & Dashboard**
   - Require authentication tokens for the server API.
   - Enforce `401` as the default for unauthorized access and add rate limiting.
   - Dashboard should display: correction rate, uncertainty ratio, median latency, top misclassifications.

9. [x] **Audio & UX Fail-safes**
  - [x] Never leave the app silent: in uncertain cases, output a neutral voice line plus visual symbol and haptic feedback.
  - [x] Add a UI timer to detect "no frame / no result" situations and degrade gracefully instead of freezing.

10. [x] **Documentation & Roadmap Cleanup**
    - [x] Keep `README.md` as a short landing page, move deeper technical documentation to `docs/*`.
    - [x] Consolidate developer notes into `docs/CodebaseOverview.md`, `docs/UserStories.md`, and `docs/TODO.md`.
    - [x] Define milestones: Stabilization → Accuracy → UX improvements ([ProjectMilestones.md](ProjectMilestones.md)) stored in the repo.
---

## 🚨 PRIORITY 1: Core Functionality (Critical Path)

### ✅ COMPLETED
- [x] React Native baseline setup
- [x] Database, navigation, and core app structure
- [x] Project architecture and foundation
- [x] **Gesture Recognition Implementation**
  - [x] Complete `mlService.ts` TFLite model loading
  - [x] Implement live gesture classification pipeline
  - [x] Test offline gesture recognition fallback
  - [x] Validate recognition accuracy with test gestures
  - [x] **Add memory management**
    - Introduced a `FrameBufferManager` to limit stored frames and dispose old ones.
  - [x] **TFLite model lifecycle cleanup**
    - Wrapped model access in a `ModelManager` that sets `isInferenceRunning` and calls `dispose()` after use.
  - [x] **Offline fallback reliability** _(update `app/src/services/mlService.ts`; see `integration/offlineFallback.spec.ts`)_
    - Ensure cloud inference failures hot‑swap to the local TFLite model within one frame.
    - Implemented in `app/src/services/mlService.ts`; test: `integration/offlineFallback.spec.ts`.
  - [x] **Offline boot mode** _(update `app/src/App.tsx`; see `integration/offlineBoot.spec.ts`)_
    - Detect offline state at startup and preload local models immediately.
    - Implemented in `app/App.tsx` and `app/src/context/AppServicesProvider.tsx`; test: `integration/offlineBoot.spec.ts`.
- [x] **Rich Audio Feedback System**
  - [x] Complete `audioService.ts` implementation using `expo-audio`
  - [x] Add success/error sound effects
  - [x] Implement speech synthesis for recognized gestures
  - [x] Test audio output quality and timing
- [x] **Speak + Show dual-trigger** _(see `app/test/speakShow.test.tsx`)_
  - Guarantee that recognition fires both speech and symbol display together with fallback handling.
  - Add haptic and visual confirmation so one failure does not block the other.
- [x] **Camera Integration**
  - [x] Finalize `react-native-vision-camera` integration
  - [x] Implement high-performance gesture capture
  - [x] Add camera permission handling
  - [x] Test frame rate and gesture capture quality
  - [x] **Comprehensive error handling**
    - Added `handleCameraError` with fallbacks for permission denial, missing devices and hardware failures.
    - Included periodic health checks using `Camera.getAvailableCameraDevices()`.

---

## 🎯 PRIORITY 2: Intelligence & User Experience

### Core HIP (Human Interaction Protocol) Implementation
- [ ] **HIP 1: Onboarding Flow**
  - [x] Complete consent and first-use setup
  - [x] Add privacy explanation for caregivers
  - [x] Implement gesture recognition tutorial
  - [ ] Test with non-technical users

- [x] **HIP 3: “This Is What She Meant” Correction Mode ("Help Me" Flow)** _(spec §5.2 "Correction Panel")_
  - [x] Implement gesture correction interface
  - [x] Add "Help Me" repair workflow
  - [x] Store corrections for model improvement
  - [x] Test correction feedback loop
  - [x] Log corrections to server training queue _(update `app/src/services/correctionService.ts`; see `server/test/test_training_queue.py`)_

- [x] **HIP 2: “Let’s Learn Together” Teach Mode (Training Interface)** _(spec §5.2 "Training Flow")_
  - [x] Build caregiver training interface for new signs
  - [x] Implement gesture recording workflow
  - [x] Add gesture validation feedback
  - [x] Create training progress tracking
  - [x] Complete end-to-end pipeline: save samples and trigger retraining _(update `app/src/screens/TeachingScreen.tsx`; see `integration/teachMode.spec.ts`)_

- [x] **HIP 4: “I’m a Little Confused” Practice Mode (Proactive Maintenance)** _(spec §5.2 "Proactive Banner")_
  - [x] Implement "Let's practice this again" feature
  - [x] Add gesture practice sessions
  - [x] Create progress tracking dashboard
  - [x] Implement gentle encouragement system
  - [x] Add dedicated practice screen for rehearsal _(update `app/src/screens/PracticeScreen.tsx`; see `integration/test/practiceMode.test.js`)_

- [x] **Caregiver portal completion** _(implement routes in `server/src/portal`; see `integration/test/portal.test.js`)_
  - Review, approve, and export recorded samples for training.

### Enhanced Intelligence Features
- [x] **Live LLM Dialog Engine** _(spec “LLM/DEV HINT”)_
  - [x] Complete `dialogEngine.ts` OpenAI API integration
  - [x] Implement context-aware suggestions
  - [x] Add conversation memory for better responses
  - [x] Test suggestion quality and relevance
  - [x] Add `APIRetryManager` with exponential backoff for failed requests _(add `app/src/services/APIRetryManager.ts`; see `app/test/apiRetry.test.ts`)_
    - Example:
      ```ts
      const retry = new APIRetryManager();
      await retry.executeWithRetry(() => callLLM(), 'dialogEngine');
      ```

- [x] **DGS Video Playback System** _(spec §5.2 "DGS Screen")_
  - [x] Complete DGS video integration on `DgsScreen`
  - [x] Add video toggle functionality
  - [x] Implement video playback controls
  - [x] Test video loading and playback performance

  - [x] **Admin Panel Enhancement**
    - [x] Complete CRUD functionality in `AdminScreen.tsx`
    - [x] Add symbol and vocabulary management
    - [x] Implement data export/import features
    - [x] Add analytics dashboard for caregivers

---

## 🔧 PRIORITY 3: Technical Infrastructure

### Model Management & Training
- [x] **Pre-trained Model Integration**
  - [x] Download and bundle MediaPipe models via `src/tools/downloadModels.ts`
  - [x] Implement model versioning system
  - [x] Add model validation checks
  - [x] Test model loading performance

- [x] **Two-Stage Frame Processor**
  - [x] Implement landmark detection in `useFrameProcessor` worklet
  - [x] Add gesture classification pipeline
  - [x] Optimize processing performance
  - [x] Test real-time processing accuracy

- [ ] **Training Interface**
  - Complete `TrainingScreen` UI implementation
  - Add guided gesture recording interface
  - Implement sample validation feedback
  - Create training progress visualization

- [ ] **Training Data Quality Assurance**
  - Validate gesture samples with `TrainingDataValidator`
    - Example: check landmark confidence, completeness and motion.
  - Provide retake suggestions based on detected issues.

- [ ] **Model Performance Monitoring**
  - Track predictions with `ModelPerformanceMonitor`
  - Alert on accuracy drops >15% and suggest retraining.

- [ ] **Occlusion Handling**
  - Detect partially hidden hands using `GestureOcclusionHandler`
  - Guide users to adjust positioning when occlusion is too high.

### Backend Services
- [x] **Secure LLM Dialog Endpoint**
  - [x] Create authenticated OpenAI proxy server
  - [x] Implement rate limiting and security measures
  - [x] Add request logging and monitoring
  - [x] Test API security and performance

- [ ] **Model Training Pipeline**
  - Create model training endpoint for landmark data
  - Implement LSTM gesture model training
  - Add training progress monitoring
  - Test model accuracy improvements

- [ ] **Model Deployment System**
  - Create model download endpoint
  - Implement secure model distribution
  - Add model activation in app
  - Test model update workflow

- [x] **Portal Completion** _(see `integration/test/portal.test.js`)_
  - Implement review and approval routes in `server/src/portal`
  - Add export features for gesture samples

---

## 🎨 PRIORITY 4: Polish & Accessibility

### UI/UX Improvements
- [ ] **Accessibility Enhancement**
  - Complete accessibility label implementation
  - [x] Add screen reader support for bottom navigation
  - [x] Implement high contrast mode
  - Test with accessibility tools
  - [x] Add rich gesture descriptions and live announcements
    - Example:
      ```ts
      announceGestureRecognition(name, confidence);
      const label = createGestureAccessibilityLabel(g, conf, ctx);
      ```
  - [x] Implement German language support
    - Hint: load `i18n/de.json` via `LanguageManager` and update gesture translations.

- [ ] **Animation & Feedback**
  - [x] Implement RN Animated API for smooth transitions
  - [x] Add Skia-based animations (optional)
  - [x] Create gentle haptic feedback system
  - [x] Add visual highlight during confirmation for accessibility
  - Test animation performance on older devices

- [ ] **Child-Friendly Interface**
  - [x] Optimize UI for 4-year-old usability
  - [x] Add colorful, engaging visual elements
  - [x] Implement large touch targets
    - Hint: use `childFriendlyStyles.minTouchTarget` (60x60, padding 12) and add haptic feedback.
    - Example:
      ```ts
      import { childFriendlyStyles } from '../styles/touchTargets';
      <Pressable style={childFriendlyStyles.primaryButton} onPress={childHaptic} />
      ```
  - Test with child users
  - [x] Add session management for attention span
    - Hint: implement `ChildSessionManager` to schedule encouragements and suggest breaks.

### Quality Assurance
- [x] **Testing Suite**
  - [x] Implement unit tests for core services
  - [x] Add integration tests for HIP workflows
  - [x] Create end-to-end testing scenarios
  - [x] Set up automated testing pipeline

- [ ] **Performance Optimization**
  - Profile and optimize gesture recognition speed
  - Minimize battery usage during operation
  - Optimize memory usage for older devices
  - Test performance across device range
  - [x] Implement adaptive processing based on battery & thermal state
    - Hint: create `AdaptivePerformanceManager` that adjusts frame rate and model complexity.

---

## 🚀 PRIORITY 5: Production Readiness

### Deployment & Distribution
- [ ] **Store Preparation**
  - Finalize EAS Build configuration
  - Complete app store metadata and screenshots
  - Implement crash reporting and analytics
  - Test store-ready binaries

- [ ] **Data Management**
  - Implement secure data backup/restore
  - Add GDPR compliance features
  - Create data export functionality
  - Test data migration scenarios
  - [x] Protect gesture data
    - Implement `GestureDataProtector` for anonymization and AES encryption.
  - [x] Enhance API key security
    - Added hash validation and secure storage in `SecureConfigManager`.

- [ ] **Offline Capability**
  - Ensure full offline functionality
  - Implement offline model training
  - Add offline progress sync
  - Test extended offline usage

### Documentation & Support
- [ ] **User Documentation**
  - [x] Create caregiver quick start guide
- [x] Add troubleshooting documentation
  - [x] Create video tutorials for setup
  - [x] Translate documentation to German

  - [x] **Technical Documentation**
    - [x] Complete API documentation
    - [x] Add deployment guides
    - [x] Create contribution guidelines
    - [x] Document architecture decisions

---

## 🔄 ONGOING MAINTENANCE

### Continuous Improvement
- [ ] **Model Refinement**
  - Regularly retrain models with new data
  - Monitor recognition accuracy metrics
  - Implement A/B testing for model improvements
  - Collect and analyze user feedback

- [ ] **Security Updates**
  - Regular dependency updates
  - Security audit scheduling
  - Privacy compliance monitoring
  - Incident response procedures

### Analytics & Monitoring
- [ ] **Usage Analytics**
  - [x] Track gesture recognition success rates
  - [x] Monitor user engagement patterns
  - Analyze correction frequency
  - Generate improvement insights

---

## 🎯 SUCCESS METRICS

### Technical Metrics
- Gesture recognition accuracy > 95%
- App response time < 200ms
- Offline functionality 100% available
- Battery usage < 5% per hour of active use

### User Experience Metrics
- Successful gesture communication per session > 80%
- User retention rate > 90% after first week
- Caregiver satisfaction score > 4.5/5
- Child engagement duration > 15 minutes per session

### Impact Metrics
- Daily successful communications tracked
- New gestures learned per week
- Caregiver confidence improvement
- Family communication satisfaction

---

*Last Updated: Based on repository state as of current analysis*
*Project Goal: Turn Amy's gestures into understanding. Every time.*
