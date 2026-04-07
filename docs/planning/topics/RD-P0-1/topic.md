# RD-P0-1 — ROI/image-processing A/B benchmark

## Kanban Status
- **Column:** Done
- **Owner:** Team
- **Last updated:** 2026-04-07

## Amy impact
- Can reduce jitter and crop failures that confuse Amy during live signing.

## Scope
- Compare baseline vs tuned ROI/image processing settings, or reject the benchmark if MediaPipe task support makes the ROI variant invalid.

## Entry points
- `webapp/src/gesture/core/GestureDetector.ts`
- `webapp/src/hooks/useSignLanguageDetector.ts`
- `docs/testing/benchmarks/`

## Evidence required for Done
- Benchmark artifact with FPS, drop rate, confidence stability.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Evidence
- Decision report: `docs/testing/benchmarks/rd-p0-1-roi-image-processing-2026-04-07.md`
- Outcome: reject ROI-based A/B benchmark for the current GestureRecognizer/PoseLandmarker/FaceLandmarker path because JS docs do not document ROI support for these task classes and the matching Java task APIs document ROI as unsupported for gesture, pose-landmark, and face-landmark detection.
- Verification: `python3 scripts/validate_docs_links.py`

## Next command
- `rg -n "ImageProcessingOptions|ROI|crop" webapp/src/gesture webapp/src/hooks docs/testing/benchmarks`
