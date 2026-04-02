# RD-P1-3 — Runtime diagnosability enhancements

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

## Amy impact
- Faster incident triage minimizes downtime risk for Amy's communication features.

## Scope
- Surface richer MediaPipe task/backend/error context into diagnostics.

## Entry points
- `webapp/src/gesture/`
- `server/src/routes/health.ts`
- `docs/operations/`

## Evidence required for Done
- Incident-style drill artifact showing faster root-cause identification.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "diagnostic|MediaPipe|health" webapp/src/gesture server/src/routes/health.ts docs/operations`
