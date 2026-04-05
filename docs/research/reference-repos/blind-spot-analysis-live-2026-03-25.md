# Blind Spot Analysis — Live Reference Source Fetch
Date: 2026-03-25  
Status: **Completed with actual downloaded files** (all 10 source files fetched successfully)

> **Status note (2026-03-26):** this document began as a pre-implementation snapshot.
> Some previously listed gaps (for example `GestureModelAdapter` and explicit MediaPipe confidence settings)
> are now implemented and retained here for historical traceability.

---

## 1. Fetch summary

The following files were downloaded with `node scripts/fetch-reference-sources.mjs --out-dir tmp/reference-sources --retries 2`:

| Repo | File | Fetch |
|------|------|-------|
| google-ai-edge/mediapipe | docs/solutions/hands.md | ✅ |
| google-ai-edge/mediapipe | docs/solutions/pose.md | ✅ |
| google-ai-edge/mediapipe | docs/solutions/face_mesh.md | ✅ |
| kinivi/hand-gesture-recognition-mediapipe | readme.md | ✅ |
| kinivi/hand-gesture-recognition-mediapipe | app.py | ✅ |
| kinivi/hand-gesture-recognition-mediapipe | utils/cvfpscalc.py | ✅ |
| kinivi/hand-gesture-recognition-mediapipe | model/keypoint_classifier/keypoint_classifier.py | ✅ |
| kevinjosethomas/sign-language-processing | readme.md | ✅ |
| kevinjosethomas/sign-language-processing | src/client/readme.md | ✅ |
| kevinjosethomas/sign-language-processing | src/client/src/app/components/Avatar.tsx | ✅ |

All 10 files downloaded; 0 failures.

---

## 2. Concrete findings per file

### 2.1 `kinivi/utils/cvfpscalc.py`

Reference implementation:
```python
class CvFpsCalc(object):
    def __init__(self, buffer_len=1):
        self._difftimes = deque(maxlen=buffer_len)
    def get(self):
        # returns rolling average FPS from deque
```

- Uses `cv.getTickCount()` + `cv.getTickFrequency()` for timing (OpenCV-specific).
- Single-number smoothed FPS output only.
- Default `buffer_len=1` means no smoothing unless caller increases it.

**Amy's Echo implementation** (`webapp/src/gesture/utils/SmoothedFpsMeter.ts`):
- Uses `performance.now()` (browser-native, no dependency).
- Computes `fpsAvg`, `fpsP95Window`, and `sampleCount` — substantially richer.
- Default `maxSamples=60` (full-second window at 60fps).
- Periodic `detector_fps_sample` telemetry emitted every 60 frames.

**Gap assessment**: ✅ **Covered and exceeded**. Amy's FPS utility is functionally a superset of the reference.

**Remaining blind spot**: Reference explicitly exposes FPS in the **visible HUD**. Amy's FPS telemetry is server-sent only; no in-app debug indicator exists for caregivers who need to diagnose performance issues on a specific device.

> **Adaptation opportunity**: Add an optional, hideable FPS badge in the gesture detector overlay for production diagnostics (`fps_avg` from `SmoothedFpsMeter`). Should be off by default, toggleable by caregiver settings.

---

### 2.2 `kinivi/model/keypoint_classifier/keypoint_classifier.py`

Reference implementation:
```python
class KeyPointClassifier(object):
    def __init__(self, model_path='...', num_threads=1):
        self.interpreter = tf.lite.Interpreter(...)
        self.interpreter.allocate_tensors()

    def __call__(self, landmark_list):
        # set tensor → invoke → return argmax result
        return result_index
```

- Minimal wrapper: one `__call__` with fixed input/output contract.
- `num_threads` for CPU parallelism.
- Returns raw class index, not score/confidence.
- No warmup step; interpreter allocates tensors once at construction.

**Amy's Echo implementation** (`webapp/src/gesture/installMlp.ts`, `webapp/src/gesture/GestureModelAdapter.ts`):
- MLP invocation still lives in `installMlp.ts`.
- A standalone `GestureModelAdapter` interface now exists.
- Returns full `{ label, score, candidates }` result.

**Gap**: ✅ **Closed in current code** (kept as historical trace from the original snapshot).

> **Adaptation opportunity**: Define a `GestureModelAdapter` interface:
> ```typescript
> interface GestureModelAdapter {
>   warmup(): Promise<void>;
>   predict(features: Float32Array): { label: string; score: number; candidates: Array<{label: string; score: number}> } | null;
>   readonly inputSize: number;
>   readonly metadata: { featureContract: string; version: string };
> }
> ```
> Wrap the current MLP invocation in a concrete `MlpGestureAdapter` that implements this interface. This enables unit testing of the adapter in isolation and future backend switching.

---

### 2.3 `kinivi/app.py` — normalization pipeline

Reference `pre_process_landmark` function:
```python
def pre_process_landmark(landmark_list):
    # 1. Subtract wrist (index 0) from all points
    # 2. Flatten to 1D
    # 3. Divide all values by max(abs(values))
    return temp_landmark_list  # shape: 21*2 = 42 values (x,y only)
```

Key observations:
- **2D only** (`x`, `y`) — `z` depth is discarded entirely.
- Max-abs normalization over the entire flat vector (not per-point).
- Uses pixel coordinates from image space, not normalized 0–1 coordinates.

**Amy's Echo contract** (`webapp/src/training/landmarkFeatureContract.ts`):
```typescript
// Uses landmark[0] as wrist origin, then max-abs over flat xyz vector
const maxAbs = Math.max(...flat.map(v => Math.abs(v)), 0);
return flat.map(v => v / maxAbs);
// Output: 21*3 = 63 values per hand (x,y,z)
```

**Amy's Echo streaming normalizer** (`webapp/src/gesture/utils/landmarkNormalizer.ts`):
```typescript
// Different scaling metric:
const maxd = translated.reduce(
  (max, [x, y, z]) => Math.max(max, Math.abs(x) + Math.abs(y) + Math.abs(z)), 0
);
```

**Gap — INTERNAL INCONSISTENCY DETECTED**: ⚠️

Two different normalization metrics exist within Amy's Echo:

| Location | Metric | Output |
|---|---|---|
| `landmarkFeatureContract.ts` | `max(\|all flat values\|)` — global max-abs | 63 values/hand |
| `landmarkNormalizer.ts::normalizeLandmarks` | `max(\|x\|+\|y\|+\|z\| per point)` — max L1-per-point | 63 values/hand |
| `server/training/frame_normalization.py` | `max(\|all flat values\|)` — global max-abs ✅ | 63 values/hand |

The `installMlp.ts` inference pipeline correctly routes to `buildDualHandFeatureVector` (which uses the canonical max-abs contract) for both multimodal and hand-only paths. The `landmarkNormalizer.ts::normalizeLandmarks` function with the L1 metric is used only in the streaming size-normalization path (`prepareLandmarksForMLP` → `landmarkTemplateDetector.ts`), which is a *different stage* from MLP training/inference.

**However**: The doc `docs/training/landmark-normalization.md` describes the MLP input as using L1 (max(|x|+|y|+|z|)), which does NOT match what `installMlp.ts` actually uses. This documentation drift is a silent blind spot that could mislead future contributors into implementing the wrong normalization.

> **Adaptation opportunity**: Update `docs/training/landmark-normalization.md` to correctly document that MLP inference uses **global max-abs** (via `landmarkFeatureContract.ts`) and reserve the L1 description for the streaming template matcher only. Add a code comment in `landmarkNormalizer.ts::normalizeLandmarks` noting it is NOT the canonical MLP normalization.

**z-coordinate gap vs reference**:
- kinivi discards `z` entirely; Amy's Echo includes `z`. This is a deliberate design choice for DGS (3D hand orientation matters in sign language), but it adds sensitivity to landmark estimation depth noise. No ablation study exists comparing z-included vs z-excluded classification accuracy.

> **Adaptation opportunity**: Add a `useZCoordinate` flag to the feature contract (defaulting to `true`) and include a benchmark note on when omitting `z` improves robustness on low-quality cameras.

---

### 2.4 `kinivi/app.py` — two-classifier temporal approach

Reference uses **two separate classifiers**:
```python
keypoint_classifier = KeyPointClassifier()         # static hand shape
point_history_classifier = PointHistoryClassifier() # dynamic finger movement

# During inference:
hand_sign_id = keypoint_classifier(pre_processed_landmark_list)
finger_gesture_id = point_history_classifier(pre_processed_point_history_list)
```

Point history tracks the last 16 positions of **index finger tip** (landmark[8]):
```python
history_length = 16
point_history = deque(maxlen=history_length)
# Stores: point_history.append(landmark_list[8]) when signing
```

**Amy's Echo**: Uses a single MLP over a sliding window of frames (server-side temporal convolution). Dynamic gestures are handled via `TemporalGestureAnalyzer` for velocity features.

**Gap**: ❌ **No explicit static vs dynamic gesture routing**.

There is no signal at inference time distinguishing "is this sign static (hand shape) or dynamic (movement trajectory)?". The single sliding-window MLP handles both, but:
- Static signs get padded with redundant temporal context they don't need.
- Dynamic signs with distinctive movement paths may be outweighed by hand-shape features across the window.

> **Adaptation opportunity**: At training time, tag each gesture bundle with `isStatic: boolean` (derived from velocity analysis across the recording). At inference, route static gestures through a single-frame confidence shortcut when a high-confidence static prediction is available, bypassing the full window accumulation.

---

### 2.5 `kinivi/app.py` — mode-based data collection / labeling

Reference allows keyboard-driven switching between inference mode and two logging modes:
- Mode 0: Normal inference
- Mode 1: Log keypoints to CSV (for static classifier training)
- Mode 2: Log point history to CSV (for dynamic classifier training)

**Amy's Echo**: Full UI-driven training workflow with caregiver-facing recording interface.

**Gap assessment**: ✅ **Covered and exceeded by design**. Amy's UI is far more accessible than keyboard modes.

---

### 2.6 `kevinjosethomas/sign-language-processing` — receptive vs expressive

From the README:
> "Receptive: Ability to interpret signed ASL and express in English. Expressive: Ability to interpret spoken English and express as ASL signs."

The expressive pipeline includes:
- 9,000+ word ASL sign database stored in PostgreSQL with pgvector.
- `all-MiniLM-L6-v2` sentence embeddings for semantic fallback (cosine similarity when exact word missing).
- ThreeJS avatar driven by pose+hand timeline sequences.

**Amy's Echo**: Receptive-only. No expressive pipeline.

**Gap**: ❌ **No expressive output capability**.

**Gap**: ❌ **No semantic embedding fallback for unknown signs**.

For Amy's use case, expressive output (communicating to others who don't know DGS) is a key future need. The current architecture stores gesture labels and recordings but has no inverse path.

> **Adaptation opportunity (P2)**: Design a `SignPlaybackRecord` type that stores per-frame pose+hand landmark snapshots alongside a sign label. These records can be derived from existing training bundles. ThreeJS-based overlay or SVG-based avatar rendering can then replay them. The existing `trainingBundle.ts` timeline format is already close to what the reference Avatar component expects.

> **Adaptation opportunity (P1)**: Add embedding-based semantic fallback using a compact on-device model. When MLP confidence is below threshold, compute cosine similarity of the gesture label embedding against known gestures in the profile vocabulary. This is already partially addressed by variation metrics but lacks vector search.

---

### 2.7 `kevinjosethomas/sign-language-processing` — Avatar.tsx

Reference component:
```typescript
export default function Avatar({ signingSpeed, getNextWord }) {
  useFrame(({ clock, scene }) => {
    const frame_index = Math.floor(elapsed * signingSpeed);
    // Reads: word.current[frameIndex][2][0] = left hand points
    //        word.current[frameIndex][2][1] = right hand points
    //        word.current[frameIndex][1]    = pose points
    // Renders: ThreeJS scene from landmark arrays
  });
}
```

Frame data format: `[frameIndex][0 = metadata | 1 = pose | 2 = [leftHand, rightHand]]`

Amy's `TimelineFrame` format (from `trainingBundle.ts`):
```typescript
type TimelineFrame = {
  handedness: string[];
  landmarks: number[][];
  handLandmarks: number[][][];
  poseLandmarks: number[][];
  faceLandmarks: number[][];
  timestampMs?: number;
};
```

**Gap assessment**: The data structure is compatible in content; Amy's format is more explicit with named fields vs positional indexing. A thin adapter could bridge the two.

> **Adaptation opportunity**: When building the expressive pipeline (P2), create a `SignTimelinePlayer` component that takes `TimelineFrame[]` and renders a WebGL or SVG skeleton overlay. Amy's format is cleaner than the reference and does not require refactoring — only a new playback renderer.

---

### 2.8 `google-ai-edge/mediapipe` — confidence threshold recommendations

From `hands.md`:
```
min_detection_confidence: 0.5 (default)
min_tracking_confidence: 0.5 (default)
```

From kinivi `app.py`:
```python
--min_detection_confidence = 0.7 (higher default for production use)
--min_tracking_confidence = 0.5
```

**Amy's Echo (current)**: Uses explicit `minDetectionConfidence`/`minTrackingConfidence` from `GestureConfig` and forwards them into `GestureRecognizer.createFromOptions`.

**Gap**: ✅ **Explicit controls implemented**; real-device tuning remains an evidence/documentation task.

The MediaPipe docs note: "Setting [minTrackingConfidence] to a higher value can increase robustness of the solution, at the expense of a higher latency." No documentation or code maps this tradeoff to Amy's device tiers (low-end tablet, mid phone, laptop webcam).

> **Adaptation opportunity**: Expose `minDetectionConfidence` and `minTrackingConfidence` in `GestureDetectorConfig` and initialize them from `GestureConfig.ts`. Add a `docs/testing/modality-tuning-matrix.md` table mapping adaptive camera tier (1280×720 → 426×240) to recommended confidence values.

---

### 2.9 `google-ai-edge/mediapipe` — pose.md and face_mesh.md findings

From `pose.md`:
- `POSE_WORLD_LANDMARKS` are 3D real-world coordinates (meters, origin at hip center) — NOT normalized image coordinates.
- Amy's Echo uses normalized image coordinates for pose; using `POSE_WORLD_LANDMARKS` instead would give absolute metric distances that are rotation-invariant.

From `face_mesh.md`:
- The face mesh uses 468 landmarks with a separate 478-point variant (includes irises).
- Amy's uses 468 as the floor (`MEDIAPIPE_FACE_LANDMARKS = 468`), which is correct but fragile if MediaPipe upgrades to 478.

**Gap**: ⚠️ **Pose coordinate space mismatch risk**.

If future pose normalization needs to compare across sessions, world coordinates would be more stable than image-space normalization. No flag or config exists to switch.

**Gap**: ⚠️ **No guard against MediaPipe model version upgrades changing landmark counts**.

> **Adaptation opportunity**: Add a runtime assertion in `landmarkNormalizer.ts` that validates `face.length >= MEDIAPIPE_FACE_LANDMARKS` before processing, and log a warning (not throw) if the count is between 468 and 478, accepting the extras silently.

---

## 3. Prioritized adaptation backlog (derived from live file analysis)

### P0 — Documentation correctness (no code change needed)

| # | Action | File(s) |
|---|--------|---------|
| P0-1 | Fix `landmark-normalization.md` — MLP input section incorrectly states L1; change to global max-abs and note that `landmarkNormalizer::normalizeLandmarks` is for template matching only. | `docs/training/landmark-normalization.md` |
| P0-2 | Add comment in `landmarkNormalizer.ts::normalizeLandmarks` clarifying it is the streaming/template path, not the canonical MLP training path. | `webapp/src/gesture/utils/landmarkNormalizer.ts` |

### P1 — Low-risk code improvements

| # | Action | File(s) |
|---|--------|---------|
| P1-1 | Expose `minDetectionConfidence` and `minTrackingConfidence` in `GestureDetectorConfig` with defaults 0.7/0.5 matching kinivi's production setting. | `webapp/src/gesture/config/GestureConfig.ts`, `webapp/src/gesture/core/GestureDetector.ts` |
| P1-2 | Add `docs/testing/modality-tuning-matrix.md` — map adaptive camera tier to recommended confidence thresholds. | `docs/testing/modality-tuning-matrix.md` (new) |
| P1-3 | Add optional debug FPS badge to gesture overlay renderer, toggled by caregiver setting. Surface `fpsAvg` from `SmoothedFpsMeter`. | `webapp/src/gesture/core/OverlayRenderer.ts`, `webapp/src/components/UserSettings.tsx` |
| P1-4 | Define `GestureModelAdapter` interface and wrap current MLP invocation as `MlpGestureAdapter`. | `webapp/src/gesture/installMlp.ts`, new `webapp/src/gesture/GestureModelAdapter.ts` |
| P1-5 | Add face landmark count range guard (468–478) in `landmarkNormalizer.ts`. | `webapp/src/gesture/utils/landmarkNormalizer.ts` |

### P2 — Medium-term improvements

| # | Action | File(s) |
|---|--------|---------|
| P2-1 | Tag training bundles with `isStatic: boolean` from velocity analysis and add static-gesture shortcut at inference (single-frame fast path). | `webapp/src/training/trainingBundle.ts`, `webapp/src/gesture/installMlp.ts` |
| P2-2 | Add `useZCoordinate` flag to feature contract with ablation docs. | `webapp/src/training/landmarkFeatureContract.ts`, `docs/training/landmark-feature-contract.md` |

### P3 — Architecture / future features

| # | Action | Notes |
|---|--------|-------|
| P3-1 | Design `SignTimelinePlayer` component for expressive output replay. | Use `TimelineFrame[]` from existing training bundles as input. |
| P3-2 | Add semantic embedding fallback for below-threshold gesture predictions. | Research: `all-MiniLM-L6-v2` locally via `transformers.js` or compact Sentence-BERT ONNX. |

---

## 4. Critical normalization parity table (live numeric comparison)

| Feature | kinivi reference | Amy contract (`landmarkFeatureContract.ts`) | Amy server (`frame_normalization.py`) | Match? |
|---|---|---|---|---|
| Coordinate system | Pixel (image space) | Normalized 0–1 (MediaPipe output) | Normalized 0–1 | ✅ equivalent post-wrist-centering |
| Dimensions | 2D (x, y) | 3D (x, y, z) | 3D (x, y, z) | ⚠️ z included (deliberate for DGS) |
| Origin | Wrist (landmark 0) | Wrist (landmark 0) | Wrist (landmark 0) | ✅ |
| Scale metric | `max(\|flat values\|)` | `max(\|flat values\|)` | `max(\|flat values\|)` | ✅ |
| Hands | 1 hand | 2 hands (left + right, padded) | 2 hands (left + right, padded) | ✅ |
| Output length | 42 (21×2) | 126 (21×3×2) | 126 (21×3×2) | ✅ |

The `landmarkNormalizer.ts::normalizeLandmarks` function (streaming path) uses a **different** scale metric (`max L1-per-point`). This does NOT affect MLP training or inference — confirmed by tracing `installMlp.ts` which routes through `buildDualHandFeatureVector` exclusively. But it must not be confused with the canonical contract.

---

## 5. Self-assessment: blind spots identified vs previously known

| Blind spot | Previously documented? | Found by live analysis? |
|---|---|---|
| Normalization documentation drift (L1 vs max-abs) | ❌ No | ✅ Yes |
| No `GestureModelAdapter` interface | ✅ Previously listed | ❌ Not current (implemented) |
| No confidence threshold tuning controls | ✅ Previously listed | ❌ Not current (implemented) |
| kinivi produces 2D features only | ❌ No | ✅ Yes |
| Avatar data format compatibility with `TimelineFrame` | ❌ No | ✅ Yes |
| No static vs dynamic gesture routing | ❌ No | ✅ Yes |
| Face landmark count fragility (468 vs 478) | ❌ No | ✅ Yes |
| FPS HUD missing from overlay (only telemetry) | ❌ No | ✅ Yes |

---

## 6. Next actions

1. **Immediate** (P0): Fix `docs/training/landmark-normalization.md` to correctly describe the MLP input normalization and remove the L1 description from that path.
2. **Short-term** (P1): Add `GestureModelAdapter` interface and `modality-tuning-matrix.md`.
3. **Medium-term** (P2): Add static/dynamic gesture routing and the `useZCoordinate` ablation flag.
4. **Re-run fetch** before any P1/P2 work to pick up newer commits if upstream repos have progressed.
