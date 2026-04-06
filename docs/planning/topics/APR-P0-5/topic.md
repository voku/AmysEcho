# APR-P0-5 — Release gate verdict refresh from real-device evidence

## Kanban Status
- **Column:** Blocked
- **Owner:** Unassigned
- **Last updated:** 2026-04-06
- **Status authority:** `docs/planning/todo.md`

## Amy impact
- Prevents a false release-ready signal by requiring Amy's real-device reliability verdict to be recalculated from caregiver-relevant hardware evidence.

## Scope
- Recompute the APR-P0-4 gate verdict after the first committed real-device protocol cycle.
- Sync the resulting verdict into release-readiness documentation and remediation ownership.
- Out of scope: collecting new benchmark data beyond the committed `APR-P0-2` / `APR-P0-1` artefacts.

## Entry points
- `docs/testing/benchmarks/results/2026-04-03/apr-p0-4-gate-interpretation.md`
- `docs/planning/release-0.0.2-readiness.md`
- `docs/testing/benchmarks/device-performance-protocol.md`

## Evidence required for Done
- Updated gate interpretation artifact with per-device G1-G4 verdicts and fleet verdict.
- Synchronized readiness status and remediation owners in `docs/planning/release-0.0.2-readiness.md`.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "APR-P0-4|APR-P0-5|G1|GO|NO-GO" docs/testing/benchmarks/results docs/planning/release-0.0.2-readiness.md docs/planning/todo.md`

## Sync rule
- Update `todo.md` first for status changes, then refresh this topic file details.

## Progress notes (2026-04-06)
- Added a canonical evaluator path in `scripts/evaluate_device_protocol_results.py` that writes `summary.json`, `summary.md`, and `apr-p0-4-gate-interpretation.md` directly from a protocol result directory.
- Remaining blocker: this refresh task still depends on committed APR-P0-2 real-device artefacts, which are not available in the current workspace.
