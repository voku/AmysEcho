# JUN-P1-7 — Unified training-job ownership and restart recovery

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-03
- **Status authority:** `docs/planning/TODO.md`

## Amy impact
- Prevents silent training regressions after crashes/restarts so Amy's personalized model updates remain reliable and predictable.

## Scope
- Establish one authoritative training job ownership model across current queueing paths.
- Define deduplication and recovery behavior for concurrent/duplicate triggers.
- Add restart-safe recovery behavior needed by post-training cron reconciliation.
- Out of scope: introducing new model architectures or changing gesture UX.

## Entry points
- `server/src/server.ts`
- `server/src/services/trainingOrchestrator.ts`
- `server/src/services/dgsAutoPretrainService.ts`
- `server/test/`

## Evidence required for Done
- Architecture decision note documenting selected queue ownership model and migration path.
- Automated tests for concurrent trigger dedupe and restart recovery expectations.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "queueTrainingJob|startTrainingJob|train-status|autoPretrain" server/src server/test`

## Sync rule
- Update `TODO.md` first for status changes, then refresh this topic file details.
