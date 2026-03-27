# External Best-Practices Blind-Spot Analysis (2026-03-27)

## Why this analysis exists

This review cross-checks Amy's Echo's current implementation priorities against:

1. Official runtime guidance for browser video/MediaPipe usage.
2. Open-source sign-language implementations that include capture + landmark + training flows.
3. Reproducibility guidance for ML evaluation and benchmark reporting.

## Sources reviewed

### Official platform/runtime docs

- MediaPipe Hand Landmarker (Web):
  - https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- MDN `requestVideoFrameCallback()`:
  - https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
- MDN media constraints/capabilities:
  - https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints
  - https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia
- scikit-learn MLP reference + leakage pitfalls:
  - https://scikit-learn.org/stable/modules/generated/sklearn.neural_network.MLPClassifier.html
  - https://scikit-learn.org/0.24/common_pitfalls.html

### Open-source implementations (GitHub)

- kinivi hand-gesture-recognition-mediapipe:
  - https://github.com/kinivi/hand-gesture-recognition-mediapipe
  - Useful patterns: lightweight keypoint CSV capture, retrain loop, FPS utility module.
- metehanozdeniz sign-language-recognition:
  - https://github.com/metehanozdeniz/sign-language-recognition
  - Useful patterns: web-based recording/import, landmark extraction pipeline, top-3 display.
- sign-language-translator datasets:
  - https://github.com/sign-language-translator/sign-language-datasets
  - Useful patterns: naming conventions for signer/camera metadata, archive taxonomy.
- sign-language-processing/datasets:
  - https://github.com/sign-language-processing/datasets
  - Useful patterns: checksums + dataset registry workflow.

## What Amy's Echo already does well

- Has profile-aware model delivery with fallback logic and artifact contract checks.
- Has adaptive camera policy and a worker-offload prototype.
- Has benchmark docs and a training/reporting workflow already established.

## Blind spots found (self-analysis)

### 1) Reproducibility artifacts are still not first-class outputs (P0)

**Observed gap:** few-shot roadmap exists, but split manifests/checksum artifacts are not yet standardized as mandatory benchmark outputs.

**External signal:** open dataset tooling emphasizes checksums and split reproducibility metadata.

**Risk:** benchmark claims are hard to compare or replay.

---

### 2) Main-thread/video-frame performance policy is not yet codified as a contract (P0)

**Observed gap:** worker prototype exists, but there is no hard gate defining when worker mode is required vs optional.

**External signal:** MediaPipe docs explicitly warn `detectForVideo()` is synchronous and blocks UI thread; MDN emphasizes frame-timed processing semantics.

**Risk:** regressions may appear on weaker devices even while CI remains green.

---

### 3) Capture metadata schema lacks a strict "field protocol" for signer/camera context (P1)

**Observed gap:** multimodal quality work exists, but signer/environment metadata contract is not yet formalized for benchmark comparability.

**External signal:** sign-language dataset projects heavily standardize naming and metadata dimensions (signer, camera angle, modality flavor).

**Risk:** noisy variance across sessions/devices weakens model diagnostics.

---

### 4) Leakage prevention rules need stronger default enforcement in benchmark tooling (P0)

**Observed gap:** split intent exists, but automated guards for group leakage are not yet visible as a required quality gate artifact.

**External signal:** scikit-learn guidance repeatedly highlights leakage/pipeline split order as a common failure mode.

**Risk:** inflated offline metrics and misleading progress.

---

### 5) "Context-free handoff" for future LLM contributors is still fragile (P1)

**Observed gap:** TODO was simplified, but tasks still need stronger "where to start" and "what evidence counts" instructions.

**External signal:** successful open-source projects include explicit run commands + output paths in contributor docs.

**Risk:** rework churn and duplicated effort when context windows are short.

## Recommended priority updates

1. Make reproducibility artifacts mandatory for every benchmark report (seed, commit SHA, dataset snapshot, split manifest checksums).
2. Define worker-offload decision contract with concrete perf thresholds and required device matrix evidence.
3. Add capture metadata protocol (signer/device/camera/lighting fields) for uploaded bundles and benchmark subsets.
4. Add explicit leakage checks in few-shot runner tests (group-based split assertions).
5. Rewrite TODO tasks with per-task entry points + first commands + evidence files.
