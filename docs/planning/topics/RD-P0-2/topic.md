# RD-P0-2 — FULL_RANGE face detector evaluation

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

## Amy impact
- Could improve robustness when Amy is not perfectly frontal to the device.

## Scope
- Evaluate FULL_RANGE mode for side-angle/partial-face scenarios.

## Entry points
- `webapp/src/gesture/`
- `integration/test/`
- `docs/testing/benchmarks/`

## Evidence required for Done
- Benchmark matrix and recommendation to enable or keep default.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "FULL_RANGE|face detector|side-angle" webapp/src/gesture integration/test docs/testing/benchmarks`
