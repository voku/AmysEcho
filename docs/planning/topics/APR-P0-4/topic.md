# APR-P0-4 — Release performance gate definition

## Kanban Status
- **Column:** Done
- **Owner:** Unassigned
- **Last updated:** 2026-04-03 (done)
- **Status authority:** `docs/planning/todo-done.md` (archived completion)

## Amy impact
- Prevents regressions that could break Amy's real-time communication loop during long sessions.

## Scope
- Define measurable pass/fail release gates for latency, FPS, thermal, and battery.
- Document go/no-go interpretation for low-end and mid-range caregiver devices.

## Entry points
- `docs/testing/benchmarks/device-performance-protocol.md`
- `docs/testing/benchmarks/performance-report-2026-03-27.md`
- `docs/planning/release-0.0.2-readiness.md`

## Evidence required for Done
- A published gate table with thresholds and at least one interpreted benchmark run.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Next command
- `rg -n "p50|p95|fps|thermal|battery|threshold" docs/testing/benchmarks docs/planning/release-0.0.2-readiness.md`

## Sync rule
- Update `todo.md` first for status changes, then refresh this topic file details.


## Progress notes
- 2026-04-03: Added canonical G1–G4 gate mapping and GO/CONDITIONAL GO/NO-GO rubric to `docs/testing/benchmarks/device-performance-protocol.md`.
- 2026-04-03: Added release-readiness interpretation guardrails that disallow CI-only performance evidence for final gate decisions.
- 2026-04-03: Interpreted benchmark evidence committed in `docs/testing/benchmarks/results/2026-04-03/apr-p0-4-gate-interpretation.md`.
