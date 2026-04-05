# JUN-P1-7 — Unified training-job ownership and restart recovery

## Kanban Status
- **Column:** Done
- **Owner:** Codex (GPT-5.3-Codex)
- **Last updated:** 2026-04-05
- **Status authority:** `docs/planning/todo-done.md` (archived completion)

## Amy impact
- Prevents silent training regressions after crashes/restarts so Amy's personalized model updates remain reliable and predictable.

## Scope
- Establish one authoritative training job ownership model across current queueing paths.
- Define deduplication and recovery behavior for concurrent/duplicate triggers.
- Add restart-safe recovery behavior needed by post-training cron reconciliation.
- Enables `JUN-P1-6` by providing a stable job source-of-truth for safe cron reconciliation, retention, and summary tasks.
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
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Progress notes (2026-04-05)
- Identified split ownership risk: `server.ts` maintains one in-memory training queue while `dgsAutoPretrainService.ts` triggers a separate queue in `trainingOrchestrator.ts`.
- Added restart-recovery persistence in `trainingOrchestrator.ts` so queued/running jobs are recovered as explicit failed states after restart instead of disappearing silently.
- Added regression test coverage for restart recovery and concurrent dedupe in `server/test/trainingOrchestrator.test.ts`.
- Published architecture decision and JUN-P1-6 handoff contract in `docs/planning/jun-p1-7-training-job-ownership-decision-2026-04-05.md`.
- First command executed for this task: `rg -ni "queueTrainingJob|startTrainingJob|train-status|autoPretrain" server/src server/test`.

## Next command
- `rg -n "JUN-P1-7|training-orchestrator-jobs|restart" docs/planning/todo-done.md docs/planning/jun-p1-7-training-job-ownership-decision-2026-04-05.md server/src/services/trainingOrchestrator.ts`

## Sync rule
- Update `todo.md` first for status changes, then refresh this topic file details.
