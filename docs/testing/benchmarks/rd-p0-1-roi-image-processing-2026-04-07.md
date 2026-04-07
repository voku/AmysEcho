# RD-P0-1 ROI / ImageProcessingOptions Benchmark Decision (2026-04-07)

## Summary

Decision: **reject ROI-based MediaPipe A/B benchmarking for the current web gesture pipeline**.

Reason: the active pipeline uses MediaPipe GestureRecognizer plus PoseLandmarker and FaceLandmarker. The JS task APIs expose `ImageProcessingOptions`, but they do not document ROI support for these task classes. The matching Java task APIs explicitly document ROI as unsupported for GestureRecognizer, PoseLandmarker, and FaceLandmarker. A runtime A/B benchmark that passes ROI options would therefore risk testing an invalid configuration instead of a documented Amy's Echo optimization.

## Evidence reviewed

- Official JS GestureRecognizer API documents `recognizeForVideo(videoFrame, timestamp, imageProcessingOptions?)`.
- Official Java GestureRecognizer API documents that `ImageProcessingOptions.regionOfInterest()` is not supported and throws for gesture recognition.
- Official Java PoseLandmarker and FaceLandmarker API pages document the same ROI unsupported behavior for landmark detection.
- Official ImageProcessingOptions docs define ROI and rotation fields, which confirms the option exists generally but does not imply support in every task.
- Local runtime entry point: `webapp/src/gesture/core/GestureDetector.ts` calls `gestureRecognizer.recognizeForVideo(this.video, frameStart)`, `poseLandmarker.detectForVideo(this.video, frameStart)`, and `faceLandmarker.detectForVideo(this.video, frameStart)`.

## Benchmark outcome

| Variant | Status | FPS / drop-rate / confidence stability evidence |
|---|---|---|
| Baseline full-frame detection | Keep | Existing runtime path remains unchanged; performance evidence continues through `detector_fps_sample` telemetry and real-device protocol artifacts. |
| ROI via `ImageProcessingOptions.regionOfInterest` | Reject before device run | Not benchmarked because JS docs do not document ROI support for these task classes and the matching Java task APIs document ROI as unsupported for gesture, pose-landmark, and face-landmark detection. Running it would risk measuring exception handling, not a documented optimization. |
| Rotation-only `ImageProcessingOptions` | Defer | Not relevant to the current jitter/crop-failure hypothesis unless device captures show orientation drift that cannot be handled by camera constraints. |

## Recommendation

Keep the current full-frame path for GestureRecognizer/PoseLandmarker/FaceLandmarker. Do not add ROI plumbing to `GestureDetector` unless a future MediaPipe Tasks Vision release documents ROI support for the specific web task APIs used by Amy's Echo.

If landmark jitter remains an issue, continue through lower-risk alternatives:

- camera constraint adaptation in `CameraManager`,
- post-landmark stability smoothing in the existing temporal/landmark pipeline,
- real-device benchmark evidence under `docs/testing/benchmarks/device-performance-protocol.md`.

## Verification

- This is a documentation/evidence decision only; no runtime code changed.
- `python3 scripts/validate_docs_links.py` passed after adding this report.

## Sources

- JS GestureRecognizer API: https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.gesturerecognizer
- Java GestureRecognizer API: https://ai.google.dev/edge/mediapipe/api/solutions/java/com/google/mediapipe/tasks/vision/gesturerecognizer/GestureRecognizer
- Java PoseLandmarker API: https://ai.google.dev/edge/api/mediapipe/java/com/google/mediapipe/tasks/vision/poselandmarker/PoseLandmarker
- Java FaceLandmarker API: https://ai.google.dev/edge/api/mediapipe/java/com/google/mediapipe/tasks/vision/facelandmarker/FaceLandmarker
- ImageProcessingOptions API: https://ai.google.dev/edge/api/mediapipe/java/com/google/mediapipe/tasks/vision/core/ImageProcessingOptions
