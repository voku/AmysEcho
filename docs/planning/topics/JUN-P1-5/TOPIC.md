# JUN-P1-5 — Ops readiness refresh drill

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-03
- **Status authority:** `docs/planning/TODO.md`

## Amy impact
- Reduces outage and recovery risk so Amy's communication remains available during incidents.

## Scope
- Run incident drill refresh and verify rollback readiness.
- Reconfirm production health monitoring ownership and escalation paths.

## Entry points
- `docs/operations/INCIDENT_DRILL_2026-03-27.md`
- `docs/operations/PRODUCTION_HEALTH_MONITORING_OWNERSHIP.md`
- `docs/planning/RELEASE_0.0.2_READINESS.md`

## Evidence required for Done
- Updated drill evidence + ownership review checklist + remediation tracking notes.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "incident|rollback|ownership|threshold" docs/operations docs/planning/RELEASE_0.0.2_READINESS.md`

## Sync rule
- Update `TODO.md` first for status changes, then refresh this topic file details.
