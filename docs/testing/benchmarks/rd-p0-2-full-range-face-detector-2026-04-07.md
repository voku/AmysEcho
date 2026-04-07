# RD-P0-2 FULL_RANGE Face Detector Evaluation (2026-04-07)

## Summary

Decision: **keep the current FaceLandmarker path and do not enable a FULL_RANGE FaceDetector variant**.

Reason: Amy's Echo currently uses MediaPipe `FaceLandmarker`, not the standalone `FaceDetector`, for non-manual face landmarks. The official FaceLandmarker model bundle documents a BlazeFace short-range face detector inside the bundle, and its configuration options do not expose a full-range selector. The standalone FaceDetector task documents separate BlazeFace short-range, full-range, and sparse full-range model assets, but its Web/JS options expose only running mode plus detection and suppression thresholds. Swapping in FULL_RANGE would therefore require adding a separate FaceDetector model path and extra per-frame task, not toggling a supported option on the existing landmark pipeline.

## Evidence reviewed

- Local runtime entry point: `webapp/src/gesture/core/GestureDetector.ts` initializes `FaceLandmarker` from `FACE_MODEL_URL` and calls `faceLandmarker.detectForVideo(this.video, frameStart)` only after gesture recognition.
- Official FaceLandmarker overview documents a packaged model bundle with face detection, face mesh, and blendshape models; the bundled face detection model is BlazeFace short-range.
- Official FaceLandmarker options list running mode, face count, detection/presence/tracking confidence, blendshape output, transformation matrix output, and callback; no full-range model selector is documented.
- Official Face Detector overview documents standalone BlazeFace short-range, full-range, and sparse full-range model assets.
- Official FaceDetectorOptions for Web/JS documents `minDetectionConfidence` and `minSuppressionThreshold`; no `modelSelection` or `FULL_RANGE` enum is documented.
- No committed side-angle or partial-face fixture set exists in `docs/testing/benchmarks/` or `webapp/src/gesture/testing/fixtures/`.

## Evaluation matrix

| Variant | Applicability | Side-angle / partial-face evidence | Recommendation |
|---|---|---|---|
| Current `FaceLandmarker` bundle | Supported by current runtime | No target-device side-angle fixture is available; keep current real-device protocol coverage path. | Keep default. It produces the face mesh landmarks Amy's Echo uses for non-manual cues and avoids new per-frame work. |
| Standalone BlazeFace short-range `FaceDetector` | Separate task, detection boxes/keypoints only | Not benchmarked because it duplicates face detection without producing the existing face mesh payload. | Do not add for RD-P0-2. |
| Standalone BlazeFace FULL_RANGE `FaceDetector` | Separate model asset and task; not a toggle on `FaceLandmarker` | Not benchmarked on-device because the repo has no side-angle fixture set, and adding the task would change runtime shape before evidence exists. | Reject for current runtime. Reconsider only as a workerized preflight experiment with side-angle fixtures and a clear handoff back to face landmarks. |
| FaceLandmarker confidence tuning | Supported option surface | Not the requested FULL_RANGE comparison; may help if future logs show confidence failures rather than angle/range failures. | Defer until real-device telemetry or fixture evidence identifies a confidence-threshold problem. |

## Recommendation

Keep `webapp/src/gesture/core/GestureDetector.ts` on the existing full-frame `FaceLandmarker` path. Do not add standalone FULL_RANGE `FaceDetector` plumbing unless fresh device captures show that short-range face detection is the limiting factor and the implementation can run off the main thread or within the existing performance budget.

If non-frontal setups remain a concern, collect a fixture pack before changing runtime code:

- frontal baseline,
- 30-degree side angle,
- 60-degree side angle,
- partial face near the preview edge,
- back-facing camera / greater distance case,
- each scenario with face coverage, face landmark count, detector FPS, and dropped-frame notes.

## Verification

- This is a documentation/evidence decision only; no runtime code changed.
- `python3 scripts/validate_docs_links.py` passed after adding this report.

## Sources

- Face Landmarker overview: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
- FaceLandmarker JS API: https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.facelandmarker
- Face Detector overview: https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector
- Face Detector Web guide: https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js
- FaceDetectorOptions JS API: https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.facedetectoroptions
