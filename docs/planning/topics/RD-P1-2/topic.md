# RD-P1-2 — Temporal smoothing upgrade path

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

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
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "temporal|smoothing|sequence|sliding window" webapp/src/gesture server/src/amyserver_tools docs/testing/benchmarks`
