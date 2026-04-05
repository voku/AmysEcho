# MAY-P1-1 — Capture metadata protocol enforcement

## Kanban Status
- **Column:** Done
- **Owner:** Codex (LLM)
- **Last updated:** 2026-04-03 (done)
- **Status authority:** `docs/planning/todo-done.md` (archived completion)

## Amy impact
- Improves training data quality and prevents silent model quality drops for Amy.

## Scope
- Persist signer/device/camera/lighting metadata end-to-end.

## Entry points
- `webapp/src/training/trainingBundle.ts`
- `server/src/routes/trainingBundleRoute.ts`
- `docs/training/landmark-stream-schema.md`

## Evidence required for Done
- Schema update and end-to-end metadata persistence tests.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Next command
- `rg -n "captureContext|signer|device|camera|lighting" webapp/src/training server/src/routes server/src/services docs/training`
