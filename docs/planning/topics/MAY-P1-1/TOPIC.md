# MAY-P1-1 — Capture metadata protocol enforcement

## Kanban Status
- **Column:** In Progress
- **Owner:** Codex (LLM)
- **Last updated:** 2026-04-03

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
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Next command
- `npm test --prefix webapp -- trainingBundle.test.ts --runInBand`
