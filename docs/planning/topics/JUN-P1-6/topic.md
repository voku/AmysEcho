# JUN-P1-6 — Cron-backed post-training operations cadence

## Kanban Status
- **Column:** Done
- **Owner:** Codex (GPT-5)
- **Last updated:** 2026-04-06
- **Status authority:** `docs/planning/todo-done.md` (archived completion)

## Amy impact
- Stabilizes the post-training lifecycle so newly trained communication models remain trustworthy without interrupting Amy's live communication flow.

## Scope
- Define post-training operations that should run on cadence (reconciliation, retention cleanup, summary generation).
- Keep upload-triggered training as primary low-latency path; cron handles only non-interactive follow-up tasks.
- Document deployment scheduling approach (system timer/cron) and failure-handling expectations.
- Depends on `JUN-P1-7` for unified training-job ownership and restart-safe source-of-truth signals that cron tasks can trust.
- Out of scope: replacing the existing upload-triggered training workflow.

## Entry points
- `server/src/server.ts`
- `server/src/routes/trainingJobsRoutes.ts`
- `server/src/services/postTrainingCadenceService.ts`
- `server/src/tools/runPostTrainingCadence.ts`
- `docs/operations/production-health-monitoring-ownership.md`
- `docs/deployment/quickstart-server.md`
- `docs/operations/post-training-cadence.md`

## Evidence required for Done
- Runbook section with cadence table, ownership, and retry/escalation policy.
- One committed dry-run artifact from a real cadence cycle.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Next command
- `rg -n "JUN-P1-6|post-training cadence|cadence/latest" docs/planning/todo-done.md docs/operations server/src`

## Sync rule
- Update `todo.md` first for status changes, then refresh this topic file details.

## Progress notes (2026-04-06)
- Added `postTrainingCadenceService.ts` to summarize orchestrator jobs, preserve retry-eligible restart interruptions, and prune only stale completed/non-retry failed jobs.
- Added `runPostTrainingCadence.ts` CLI plus optional server scheduling through `POST_TRAINING_CADENCE_*` config and a latest-summary operator endpoint at `/api/v1/train-status/cadence/latest`.
- Added targeted regression coverage in `server/test/postTrainingCadenceService.test.ts`, `server/test/trainingJobsRoutes.test.ts`, and `server/test/configRateLimitDefaults.test.ts`.
- Published the runbook in `docs/operations/post-training-cadence.md` and a committed dry-run evidence set in `docs/operations/post-training-cadence-dry-run-2026-04-06.md`.
- First command executed for this task: `rg -ni "train-status|trainingQueue|jobQueue|backup|monitor" server/src docs/operations docs/deployment`
