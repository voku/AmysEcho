# Modality Tuning Matrix

This document maps MediaPipe detection/tracking confidence thresholds and Amy's Echo
adaptive camera quality tiers to expected quality and latency trade-offs.

Use this matrix when diagnosing recognition quality regressions, tuning for a new
device class, or making the case for adaptive confidence changes.

---

## MediaPipe threshold semantics

| Parameter | Scope | Effect when increased |
|---|---|---|
| `minDetectionConfidence` | Palm detection stage | Fewer false positive detections; requires clearer hand entry |
| `minTrackingConfidence` | Landmark tracking stage | Forces re-detection more often; more robust to occlusion but higher CPU |

Source: [MediaPipe Hands solution docs](https://github.com/google-ai-edge/mediapipe/blob/9d38d191b060cbfeaeb0c1aa20e47201f032ea35/docs/solutions/hands.md)

---

## Reference baselines from external repos

| Source | `min_detection_confidence` | `min_tracking_confidence` | Notes |
|---|---|---|---|
| MediaPipe default | 0.5 | 0.5 | Balanced for demos |
| kinivi production | 0.7 | 0.5 | Higher detection threshold, fewer false starts |
| Amy's Echo (current) | 0.7 | 0.5 | Explicitly set in `GestureConfig` and consumed by detector options |

**Current baseline**: Amy's Echo now sets explicit detector defaults in `GestureDetectorConfig`
(`minDetectionConfidence=0.7`, `minTrackingConfidence=0.5`) and passes them into
`GestureRecognizer.createFromOptions`.

---

## Adaptive camera tier vs recommended confidence matrix

Amy's Echo `CameraManager` uses four constraint tiers. This table provides recommended
confidence tuning guidance per tier based on expected image quality.

| Tier | Resolution | Frame Rate | Expected quality | `minDetectionConfidence` | `minTrackingConfidence` | Notes |
|---|---|---|---|---|---|---|
| 0 — `ideal` | 1280×720 | 30 fps | High | **0.7** | **0.5** | Production default; matches kinivi recommendation |
| 1 — `balanced` | 960×540 | 24 fps | Good | **0.65** | **0.5** | Minor reduction acceptable |
| 2 — `low` | 640×480 | 20 fps | Acceptable | **0.6** | **0.45** | Lower detection threshold catches more frames |
| 3 — `minimal` | 426×240 | 15 fps | Poor | **0.5** | **0.4** | Minimal settings; accept more noise, re-detect often |

**Rationale**: On lower-quality video streams landmark estimation is noisier.
Lowering `minDetectionConfidence` prevents the detector from dropping frames entirely;
lowering `minTrackingConfidence` forces more frequent re-detections to correct drift.

---

## Modality-specific guidance

### Hand detection (`GestureRecognizer`)

- Primary modality for sign recognition. Do not reduce `minDetectionConfidence` below 0.5.
- `numHands=2` is required for DGS (many signs use both hands simultaneously).

### Pose detection (`PoseLandmarker`)

- Uses `pose_landmarker_lite` model for speed.
- No explicit confidence exposed via Tasks Vision API for `PoseLandmarker` in VIDEO mode;
  quality is controlled by GPU/CPU delegate selection.
- On minimal camera tier, consider disabling pose if frame budget is exceeded
  (pose is optional for hand-only MLP models).

### Face detection (`FaceLandmarker`)

- Uses full `face_landmarker` model (468 landmarks).
- The model also supports a 478-point variant (adds irises). Amy's Echo clips to 468.
  A range guard (`face.length >= 468`) already exists; log a warning if `face.length > 468`.
- On minimal camera tier, disable face landmarks if frame budget is exceeded
  (face features weighted at `FACE_PRIORITY_FACTOR=0.05` so impact is low).

---

## Benchmark protocol

Run the following benchmark for each new device class before adjusting defaults:

1. Record a 2-minute session on the target device using tier 0 (ideal).
2. Replay the same session through the recognizer at tiers 1–3 by overriding constraints.
3. For each tier, measure:
   - Detection rate (frames with at least one detected hand / total frames).
   - Classification accuracy on a known gesture set.
   - Per-frame processing time (p50 / p95 from `SmoothedFpsMeter`).
4. Choose the lowest tier that keeps detection rate ≥ 85% and p95 latency ≤ 50 ms.
5. Record results in `docs/testing/benchmarks/` with device name and OS version.

---

## Implementation status

| Action | Status |
|---|---|
| Expose `minDetectionConfidence` / `minTrackingConfidence` in `GestureDetectorConfig` | ✅ Done |
| Pass thresholds into `GestureRecognizer.createFromOptions` | ✅ Done |
| Auto-adjust thresholds when `CameraManager` changes tier | ⬜ Pending (P2) |
| Benchmark results for low-end tablet | ⬜ Not yet captured |
| Benchmark results for mid-range phone | ⬜ Not yet captured |
| Benchmark results for laptop webcam | ⬜ Not yet captured |
