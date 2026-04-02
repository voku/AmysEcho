# MAY-P1-1 — Capture metadata protocol enforcement

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

## Amy impact
- Improves training data quality and prevents silent model quality drops for Amy.

## Scope
- Persist signer/device/camera/lighting metadata end-to-end.

## Entry points
- `webapp/src/training/trainingBundle.ts`
- `server/src/routes/trainingBundleRoute.ts`
- `docs/training/LANDMARK_STREAM_SCHEMA.md`

## Evidence required for Done
- Schema update and end-to-end metadata persistence tests.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "metadata|lighting|device|camera" webapp/src/training server/src/routes docs/training`
