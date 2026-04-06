# JUL-P1-1 — Long-session hardware baselines

## Kanban Status
- **Column:** Blocked
- **Owner:** Unassigned
- **Last updated:** 2026-04-06
- **Status authority:** `docs/planning/todo.md`

## Amy impact
- Protects Amy's long communication sessions from thermal throttling and battery failures.

## Scope
- Measure FPS/thermal/battery over long sessions on target devices.

## Entry points
- `docs/testing/benchmarks/`

## Evidence required for Done
- Published baseline benchmark table and interpretation.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "thermal|battery|long-session|baseline" docs/testing/benchmarks`

## Progress notes (2026-04-06)
- The APR evaluator/tooling path is now available for consistent G1-G4 interpretation once device artefacts exist.
- Remaining blocker: this topic depends on the same target-device hardware access and long-session measurements that are still missing for APR-P0-2.
