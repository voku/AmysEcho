# RD-P0-2 — FULL_RANGE face detector evaluation

## Kanban Status
- **Column:** Done
- **Owner:** Team
- **Last updated:** 2026-04-07

## Amy impact
- Could improve robustness when Amy is not perfectly frontal to the device.

## Scope
- Evaluate FULL_RANGE mode for side-angle/partial-face scenarios, or reject the variant if the current MediaPipe task surface makes it unsuitable.

## Entry points
- `webapp/src/gesture/`
- `integration/test/`
- `docs/testing/benchmarks/`

## Evidence required for Done
- Benchmark matrix and recommendation to enable or keep default.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Evidence
- Decision report: `docs/testing/benchmarks/rd-p0-2-full-range-face-detector-2026-04-07.md`
- Outcome: keep the current `FaceLandmarker` path and reject adding standalone FULL_RANGE `FaceDetector` plumbing for the current runtime, because FULL_RANGE is a separate detector model asset rather than a documented selector on `FaceLandmarker`, and the repo has no side-angle/partial-face fixture set to justify duplicate per-frame face work.
- Verification: `python3 scripts/validate_docs_links.py`

## Next command
- `rg -n "FULL_RANGE|face detector|side-angle" webapp/src/gesture integration/test docs/testing/benchmarks`
