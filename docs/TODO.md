# Amy's Echo - Updated TODO List

## Current Status Summary
The project has a stable foundation after a major refactor. The database, navigation, and core app structure are complete. The next phase focuses on implementing scaffolded features to reach production readiness.

> Integration tests live under the repo's `integration/test` directory.

## 🔑 Immediate Gesture Detection & Visualization Fixes

1. [x] Integrate `vision-camera-resize-plugin` for zero-copy frame resizing and color conversion.
2. [x] Verify `extractHandLandmarks` uses the plugin and returns valid coordinates; add temporary logging inside the worklet.
3. [x] Restore gesture classification pipeline:
   - ensure `classifyGesture` consumes the flattened landmark buffer.
   - confirm `mlService.processFrameAsync` sends results back to JS.
4. [x] Fix hand landmark overlay on `RecognitionScreen`:
   - ensure `landmarks` array flows to the overlay with proper scaling.
   - add a debug toggle to display raw landmarks.
5. [x] Regression and stability checks:
   - exercise both online and offline recognition paths within the 400 ms timeout.
   - run `integration/offlineFallback.spec.ts` and `integration/offlineBoot.spec.ts`.

# Amy's Echo - Hand Gesture Recognition Implementation Plan

## Mission: Get Hand Gestures Actually Working
Priority: Make the hand gesture pipeline robust, real-time, and production-ready like the MediaPipe Android sample.

## Current State Analysis
Recent commits show solid foundation work:
- ✅ **Landmark extraction simplified**: Direct Float32Array → 2D (21×3) processing
- ✅ **Camera robustness**: Device selection works across VisionCamera versions
- ✅ **Stability improvements**: One Euro filter smoothing, duplicate extraction prevention
- ✅ **Error handling**: JS fallback, malformed output guards

**Gap**: Need to bridge from "stable landmarks" to "reliable gesture classification"

---

## Task 1: Fix the Gesture Classification Pipeline

### Objective
Ensure the TFLite gesture classifier actually works with real camera data.

### Critical Implementation
**File**: `app/src/services/mlService.ts`

**Current Issue**: The classifier might not be getting properly formatted data or the model isn't loading correctly.

**Action Steps**:
1. **Verify model loading**:
2. **Validate input format**:
3. **Check output parsing**:

**Expected Fix**: Classification should work consistently with live camera frames.

---

## Task 2: Real-Time Performance Optimization

### Objective
Achieve MediaPipe-level responsiveness (15-30 FPS processing).

### Implementation Areas

#### A. Frame Processing Efficiency
**File**: `app/src/services/cameraService.ts`

**Optimizations**:
- Skip frames if ML pipeline is busy
- Implement frame dropping to maintain real-time feel
- Add FPS monitoring and display

#### B. Landmark Processing Speed
**File**: `app/src/services/landmarkExtractor.ts`

**Current Win**: Direct Float32Array processing is good
**Enhancement**: Add timing logs to identify bottlenecks

---

## Task 3: Gesture Recognition Reliability

### Objective
Make gesture detection as reliable as the MediaPipe sample.

### Implementation Focus

#### A. Input Normalization
**File**: `app/src/services/landmarkNormalizer.ts` (create)

**Missing Piece**: Landmarks need normalization before classification
```typescript
export function normalizeLandmarks(landmarks: number[][]): number[] {
  // 1. Translate to wrist (landmark[0])
  const wrist = landmarks[0];
  const translated = landmarks.map(point => 
    [point[0] - wrist[0], point[1] - wrist[1], point[2] - wrist[2]]
  );
  
  // 2. Scale by hand size (distance from wrist to middle finger tip)
  const middleTip = translated[12];
  const handSize = Math.sqrt(
    middleTip[0] ** 2 + middleTip[1] ** 2 + middleTip[2] ** 2
  );
  
  const normalized = translated.map(point => 
    [point[0] / handSize, point[1] / handSize, point[2] / handSize]
  );
  
  return normalized.flat();
}
```

#### B. Confidence Thresholding
**File**: `app/src/services/mlService.ts`

**Enhancement**: Add proper confidence handling like MediaPipe

#### C. Temporal Stability
**File**: `app/src/services/gestureStabilizer.ts` (create)

**Missing**: Gesture debouncing like MediaPipe sample
```typescript
class GestureStabilizer {
  private gestureHistory: string[] = [];
  private readonly historySize = 5;
  
  addGesture(gesture: string): string | null {
    this.gestureHistory.push(gesture);
    if (this.gestureHistory.length > this.historySize) {
      this.gestureHistory.shift();
    }
    
    // Return gesture only if it's stable across multiple frames
    const counts = this.gestureHistory.reduce((acc, g) => {
      acc[g] = (acc[g] || 0) + 1;
      return acc;
    }, {});
    
    const dominant = Object.keys(counts).reduce((a, b) => 
      counts[a] > counts[b] ? a : b
    );
    
    // Need 60% consistency to accept gesture
    if (counts[dominant] / this.gestureHistory.length >= 0.6) {
      return dominant;
    }
    
    return null;
  }
}
```

---

## Task 4: Debug & Validation Tools

### Objective
Add MediaPipe-style debug overlays to verify the pipeline works.

### Implementation

#### A. Debug Overlay
**File**: `app/src/components/DebugOverlay.tsx` (create)

**Features**:
- Live FPS counter
- Current gesture + confidence
- Landmark points visualization
- Processing time metrics
- Model loading status

```tsx
export function DebugOverlay({ 
  fps, 
  currentGesture, 
  confidence, 
  landmarks,
  processingTime 
}) {
  return (
    <View style={styles.debugOverlay}>
      <Text>FPS: {fps.toFixed(1)}</Text>
      <Text>Gesture: {currentGesture} ({(confidence * 100).toFixed(1)}%)</Text>
      <Text>Processing: {processingTime.toFixed(1)}ms</Text>
      {landmarks && <LandmarkPoints landmarks={landmarks} />}
    </View>
  );
}
```

#### B. Device Testing Script
**File**: `scripts/test-gestures.js` (create)

**Purpose**: Quick validation on Android device
```javascript
// Test script to verify:
// 1. Camera starts
// 2. Landmarks are detected
// 3. Gestures are classified
// 4. FPS is acceptable (>10 FPS)
// 5. No crashes after 5 minutes
```

---

## Task 5: Production Readiness

### Objective
Ensure gesture recognition works reliably in real-world conditions.

### Critical Fixes

#### A. Error Recovery
**File**: `app/src/services/gestureService.ts`

**Robust Pipeline**:

#### B. Memory Management
**File**: `app/src/services/mlService.ts`

**Critical**: Prevent memory leaks during continuous processing

---

## Success Criteria - "It Actually Works"

### Immediate Validation
- [ ] **Camera → Landmarks**: Consistent 21×3 landmark detection
- [ ] **Landmarks → Gestures**: Reliable classification (>80% accuracy)
- [ ] **Real-time**: 15+ FPS on target Android device
- [ ] **Stability**: No crashes during 5-minute continuous use
- [ ] **Responsiveness**: Gesture changes detected within 500ms

### MediaPipe Parity Checklist
- [ ] Smooth landmark tracking (no jitter)
- [ ] Confident gesture recognition with proper thresholds
- [ ] Temporal stability (no flickering between gestures)
- [ ] Graceful handling of no-hand scenarios
- [ ] Debug overlay shows live pipeline status

### Device Testing Protocol
1. **Deploy to Android device**: `expo run:android`
2. **Test core gestures**: Open palm, closed fist, pointing
3. **Stress test**: 5 minutes continuous use
4. **Edge cases**: Poor lighting, partial occlusion, fast movement
5. **Performance**: Monitor FPS, battery drain, memory usage

---

## Next Development Iteration

After gesture recognition is solid:
1. **Multi-hand support**: Extend to two hands if needed
2. **Custom gesture training**: Allow users to add gestures
3. **Gesture combinations**: Support sequential gestures
4. **Performance optimization**: GPU acceleration, model quantization

**Bottom Line**: Focus on making the basic gesture pipeline bulletproof before adding complexity.

## Recognition Stabilization (TFLite, VisionCamera v4) — 2025-08
- ✅ Worklets correctness: 'worklet' directive + Worklets.createRunOnJS (no Reanimated runOnJS).
- ✅ Camera `pixelFormat="yuv"` for ML path (`app/src/screens/RecognitionScreen.tsx`, `app/src/screens/TrainingScreen.tsx`).
- ✅ `useFrameProcessor` hooks implemented in `app/src/services/mlService.ts`.
- ✅ Backpressure: single in-flight inference; JS callbacks only on state change.
- ✅ One-time TFLite load; no per-frame allocations.
- ✅ Bounded, PII-free telemetry buffer; perf budget test.
 - [x] Move resize/convert into a VisionCamera frame processor plugin for zero-copy via `vision-camera-resize-plugin`.
 - ✅ Metro bundler configured to load `.tflite` and MediaPipe `.task` model assets via `app/metro.config.js`.
 - [x] Register `vision-camera-resize-plugin` in `app/metro.config.js`.
 - [x] Replace inference stub with plugin-backed implementation in `app/src/services/mlService.ts`.

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
- [x] **HIP 1: Onboarding Flow**
  - [x] Complete consent and first-use setup
  - [x] Add privacy explanation for caregivers
  - [x] Implement gesture recognition tutorial
  - [x] Test with non-technical users
    - See [NonTechnicalUserTestingGuide](NonTechnicalUserTestingGuide.md).

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

- [x] **Training Interface**
  - [x] Complete `TrainingScreen` UI implementation
  - [x] Add guided gesture recording interface
  - [x] Implement sample validation feedback
  - [x] Create training progress visualization

- [x] **Training Data Quality Assurance**
  - [x] Validate gesture samples with `TrainingDataValidator`
    - Example: check landmark confidence, completeness and motion.
  - [x] Provide retake suggestions based on detected issues.

- [x] **Model Performance Monitoring**
  - [x] Track predictions with `ModelPerformanceMonitor`
  - [x] Alert on accuracy drops >15% and suggest retraining.

- [x] **Occlusion Handling**
  - [x] Detect partially hidden hands using `GestureOcclusionHandler`
  - [x] Guide users to adjust positioning when occlusion is too high.

### Backend Services
- [x] **Secure LLM Dialog Endpoint**
  - [x] Create authenticated OpenAI proxy server
  - [x] Implement rate limiting and security measures
  - [x] Add request logging and monitoring
  - [x] Test API security and performance

- [x] **Model Training Pipeline**
  - [x] Create model training endpoint for landmark data
  - [x] Implement LSTM gesture model training
  - [x] Add training progress monitoring
  - [x] Test model accuracy improvements

- [x] **Model Deployment System**
  - [x] Create model download endpoint
  - [x] Implement secure model distribution
  - [x] Add model activation in app
  - [x] Test model update workflow

- [x] **Portal Completion** _(see `integration/test/portal.test.js`)_
  - Implement review and approval routes in `server/src/portal`
  - Add export features for gesture samples

---

## 🎨 PRIORITY 4: Polish & Accessibility

### UI/UX Improvements
 - [x] **Accessibility Enhancement**
  - [x] Complete accessibility label implementation
  - [x] Add screen reader support for bottom navigation
  - [x] Implement high contrast mode
  - [x] Test with accessibility tools
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

- [x] **Child-Friendly Interface**
  - [x] Optimize UI for 4-year-old usability
  - [x] Add colorful, engaging visual elements
  - [x] Implement large touch targets
    - Hint: use `childFriendlyStyles.minTouchTarget` (60x60, padding 12) and add haptic feedback.
    - Example:
      ```ts
      import { childFriendlyStyles } from '../styles/touchTargets';
      <Pressable style={childFriendlyStyles.primaryButton} onPress={childHaptic} />
      ```
  - [x] Test with child users
    - See [ChildUserTestingGuide](ChildUserTestingGuide.md).
  - [x] Add session management for attention span
    - Hint: implement `ChildSessionManager` to schedule encouragements and suggest breaks.

### Quality Assurance
- [x] **Testing Suite**
  - [x] Implement unit tests for core services
  - [x] Add integration tests for HIP workflows
  - [x] Create end-to-end testing scenarios
  - [x] Set up automated testing pipeline

 - [x] **Performance Optimization**
  - [x] Profile gesture recognition speed
  - [x] Minimize battery usage during operation
    - Camera auto-pauses after inactivity to conserve power.
  - [x] Optimize memory usage for older devices
  - [x] Test performance across device range
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
  - [x] Implement secure data backup/restore
  - [x] Add GDPR compliance features
    - Provide profile data export and deletion endpoints for caregiver requests
  - [x] Create data export functionality
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
  - [x] Analyze correction frequency
  - [x] Generate improvement insights

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
