# JUN-P1-7 — Training Job Ownership & Restart Recovery Decision (2026-04-05)

## Context

Two training entry paths exist today:

1. `server.ts` queue (`startTrainingJob`) for upload/bundle-triggered training.
2. `trainingOrchestrator.ts` queue (`queueTrainingJob`) for profile-label auto-pretrain flows.

Without explicit ownership and restart semantics, in-flight jobs can become non-observable after restarts, which blocks safe reconciliation/retention work planned in `JUN-P1-6`.

## Decision

1. **Authoritative job record contract for orchestrator-managed jobs**
   - `trainingOrchestrator.ts` persists queue state to `DATA_DIR/training-orchestrator-jobs.json`.
   - On restart recovery, any `queued` or `running` job is converted to `failed` with an explicit restart-interruption reason.
   - `completed` jobs are preserved unchanged.

2. **Deduplication contract**
   - For a given profile, concurrent queue attempts in `queueTrainingJob(profileId)` must return one shared in-flight job ID while job state is `queued`/`running`.

3. **Handoff contract for JUN-P1-6 cadence jobs**
   - Cadence/reconciliation jobs must treat orchestrator-recovered `failed` states as retry-eligible interrupted jobs.
   - Cadence logic must never assume in-memory continuity across restarts.

## Why this direction

- Preserves observability and retryability after process restarts (no silent loss).
- Keeps behavior deterministic for operators and future cron-based reconciliation.
- Provides a stable contract now, while allowing future convergence of queue paths behind a single persistence layer.

## Evidence links

- Implementation: `server/src/services/trainingOrchestrator.ts` (state persistence + recovery).
- Tests: `server/test/trainingOrchestrator.test.ts` (restart recovery + concurrent dedupe).
- Topic board: `docs/planning/topics/JUN-P1-7/TOPIC.md`.
