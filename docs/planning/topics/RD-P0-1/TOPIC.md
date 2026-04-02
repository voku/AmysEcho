# RD-P0-1 — ROI/image-processing A/B benchmark

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

## Amy impact
- Can reduce jitter and crop failures that confuse Amy during live signing.

## Scope
- Compare baseline vs tuned ROI/image processing settings.

## Entry points
- `webapp/src/gesture/core/GestureDetector.ts`
- `webapp/src/hooks/useSignLanguageDetector.ts`
- `docs/testing/benchmarks/`

## Evidence required for Done
- Benchmark artifact with FPS, drop rate, confidence stability.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "ImageProcessingOptions|ROI|crop" webapp/src/gesture webapp/src/hooks docs/testing/benchmarks`
