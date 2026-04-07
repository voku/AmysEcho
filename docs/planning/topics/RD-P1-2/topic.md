# RD-P1-2 — Temporal smoothing upgrade path

## Kanban Status
- **Column:** Done
- **Owner:** Team
- **Last updated:** 2026-04-07

## Amy impact
- Can improve sign disambiguation without sacrificing responsiveness for Amy.

## Scope
- Prototype sequence-aware approach under strict latency budget.

## Entry points
- `webapp/src/gesture/core/ProcessingSteps.ts`
- `server/src/amyserver_tools/sliding_window.py`
- `docs/testing/benchmarks/`

## Evidence required for Done
- Prototype comparison report with accuracy and p95 latency impacts.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Evidence
- Decision report: `docs/testing/benchmarks/rd-p1-2-temporal-smoothing-prototype-2026-04-07.md`
- Outcome: keep the existing lightweight temporal prototype path and benchmark harness, but do not enable a heavier production sequence model without labeled DGS accuracy data and target-device battery/thermal evidence.
- Verification: `npm test -- --run src/gesture/utils/MultiScaleTemporalFeatureExtractor.test.ts src/gesture/utils/TemporalGestureAnalyzer.test.ts src/gesture/utils/MultimodalSmoother.test.ts`; `npm run benchmark:temporal-smoothing`.

## Next command
- `rg -n "temporal|smoothing|sequence|sliding window" webapp/src/gesture server/src/amyserver_tools docs/testing/benchmarks`
