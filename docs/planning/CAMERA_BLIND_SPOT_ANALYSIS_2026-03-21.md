# Camera & DGS Detection Blind-Spot Analysis (2026-03-21)

## Context
- **Status:** Archived analysis context (dated 2026-03-21).
- **Execution source of truth:** `docs/planning/TODO.md`.

This analysis reviews the previous camera auto-start refactor (commit `e48fd6f`) and identifies blind spots against current web best practices for browser camera capture and real-time sign-language detection.

## Sources reviewed

### External web best-practice sources
- MDN `MediaDevices.getUserMedia()`:
  - https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN media constraints:
  - https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints
  - https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode
- MDN `requestVideoFrameCallback()`:
  - https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- web.dev frame-synced processing:
  - https://web.dev/articles/requestvideoframecallback-rvfc
- Google AI Edge MediaPipe Hand Landmarker (Web):
  - https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- Google AI Edge MediaPipe Pose Landmarker (Web):
  - https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- Google AI Edge MediaPipe Face Landmarker (Web):
  - https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
- scikit-learn `MLPClassifier` reference (training dynamics, regularization, early stopping):
  - https://scikit-learn.org/stable/modules/generated/sklearn.neural_network.MLPClassifier.html

### Internal Amy's Echo documentation reviewed
- `docs/integration/GestureEnvironmentSetup.md` (current on-device MediaPipe + local MLP architecture).
- `docs/integration/DGS_Integration_Guide.md` (capture → bundle → training flow).
- `docs/testing/GestureRecognitionTesting.md` and `docs/testing/DeviceTesting.md` (runtime validation expectations).
- `docs/testing/benchmarks/multimodal_vs_handonly_report.md` (current benchmark status and limitations).
- `docs/training/TRAINING_METRICS_DASHBOARD.md` (current operational metrics posture).
- `docs/archive/HOLISTIC_VS_HANDS_BENCHMARK.md` (legacy benchmark protocol still useful as checklist input).

## What we got right in the previous change
1. **Removed user friction** by auto-starting camera in detection and training screens.
2. **Reduced cold-start overhead** by warming orchestrator initialization.
3. **Kept UX language in German** and adjusted tests/docs.

## Blind spots found

### 1) "Performance check" was not realistic enough
- Previous validation relied on unit tests, type-check, lint, and build.
- This confirms correctness but **does not measure real camera startup latency, FPS stability, thermal impact, or battery** on target caregiver devices.

### 2) Missing first-class startup telemetry for camera readiness
- We still do not emit a dedicated metric such as:
  - `camera_start_requested_at`
  - `camera_stream_ready_at`
  - `detector_first_frame_at`
- Without this, regressions can hide behind green tests.

### 3) Main-thread contention risk remains
- MediaPipe documentation notes `detect()`/`detectForVideo()` are synchronous and may block UI; worker offload is recommended for smoother UX.
- Our current architecture still risks frame processing contention on weaker devices.

### 4) Constraint adaptation is not yet device-aware
- We currently support camera switching but do not maintain a dynamic constraints strategy (e.g., degrade resolution/FPS on sustained lag/heat).
- Best practice suggests capability-aware constraints (`ideal` vs `exact`) and fallback behavior.

### 5) Continuous long-session baselines still missing
- The project TODO already calls this out (FPS, thermal, battery over longer sessions).
- This remains a production-readiness gap for Amy-first reliability.

## Recommended next actions (ordered)
1. **Add runtime startup telemetry (P0)**
   - Record and persist camera-start latency milestones.
   - Add weekly trend review in training metrics dashboard.

2. **Create realistic performance protocol (P0)**
   - Target devices: at least one low-end Android tablet, one mid-range phone, one laptop webcam.
   - Run fixed scenarios: first launch, route switch, camera flip, 20-minute continuous detection.
   - Track: startup latency, median FPS, p95 frame processing, thermal warnings, battery delta.

3. **Introduce adaptive quality policy (P1)**
   - Start with `ideal` constraints; step down quality when lag thresholds are exceeded.
   - Preserve a stable communication path before visual fidelity.

4. **Evaluate worker offload for detector pipeline (P1)**
   - Prototype worker execution for frame processing path.
   - Compare UI responsiveness and dropped-frame rate against baseline.

5. **Protect non-manual feature quality (P1)**
   - Keep explicit checks for face/pose availability and alert caregivers when these degrade.
   - Ensure performance optimizations do not silently disable non-manual cues.

## Amy impact
- These actions reduce startup delay and jitter risk, making communication more immediate and dependable.
- They also make regressions visible early, preventing silent quality erosion in real caregiver sessions.
