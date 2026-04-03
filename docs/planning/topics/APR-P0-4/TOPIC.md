# APR-P0-4 — Release performance gate definition

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-03
- **Status authority:** `docs/planning/TODO.md`

## Amy impact
- Prevents regressions that could break Amy's real-time communication loop during long sessions.

## Scope
- Define measurable pass/fail release gates for latency, FPS, thermal, and battery.
- Document go/no-go interpretation for low-end and mid-range caregiver devices.

## Entry points
- `docs/testing/benchmarks/device_performance_protocol.md`
- `docs/testing/benchmarks/performance_report_2026-03-27.md`
- `docs/planning/RELEASE_0.0.2_READINESS.md`

## Evidence required for Done
- A published gate table with thresholds and at least one interpreted benchmark run.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "p50|p95|fps|thermal|battery|threshold" docs/testing/benchmarks docs/planning/RELEASE_0.0.2_READINESS.md`

## Sync rule
- Update `TODO.md` first for status changes, then refresh this topic file details.
