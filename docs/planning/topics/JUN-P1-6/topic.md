# JUN-P1-6 — Cron-backed post-training operations cadence

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-03
- **Status authority:** `docs/planning/todo.md`

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
- `docs/operations/production-health-monitoring-ownership.md`
- `docs/deployment/quickstart-server.md`

## Evidence required for Done
- Runbook section with cadence table, ownership, and retry/escalation policy.
- One committed dry-run artifact from a real cadence cycle.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -ni "train-status|trainingQueue|jobQueue|backup|monitor" server/src docs/operations docs/deployment`

## Sync rule
- Update `todo.md` first for status changes, then refresh this topic file details.
