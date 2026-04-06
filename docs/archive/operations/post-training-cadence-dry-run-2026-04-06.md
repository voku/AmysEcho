# JUN-P1-6 — Post-training cadence dry-run evidence (2026-04-06)

## Scope

- Validate the new post-training cadence service for reconciliation, retention review, and summary generation.
- Verify that `JUN-P1-7` restart-interrupted jobs are surfaced as retry-eligible and excluded from silent retention pruning.
- Capture a committed dry-run artifact set that future operators can replay.

## First command

```bash
node server/dist/tools/runPostTrainingCadence.js \
  --dry-run \
  --state-file server/test/fixtures/post-training-cadence/training-orchestrator-jobs.json \
  --report-dir docs/operations/post-training-cadence-dry-run-2026-04-06-artifacts
```

## Input state

- Source-of-truth state file: `server/test/fixtures/post-training-cadence/training-orchestrator-jobs.json`
- Job mix in fixture:
  - 1 active `running` job
  - 1 `failed` restart-interrupted retry candidate
  - 2 stale retention candidates (`completed` / non-retry `failed`)

## Result snapshot

- Dry run completed successfully (`exit 0`).
- Restart-interrupted jobs were reported as retry-eligible and **not** marked for removal.
- Active queued/running jobs were excluded from retention decisions.
- Two stale historical jobs were identified as retention candidates under the 14-day policy.

## Produced artifacts

- `docs/operations/post-training-cadence-dry-run-2026-04-06-artifacts/latest.json`
- `docs/operations/post-training-cadence-dry-run-2026-04-06-artifacts/latest.md`
- `docs/operations/post-training-cadence-dry-run-2026-04-06-artifacts/post-training-cadence-2026-04-06T00-33-30.373Z.json`
- `docs/operations/post-training-cadence-dry-run-2026-04-06-artifacts/post-training-cadence-2026-04-06T00-33-30.373Z.md`

## Notes

- The committed dry-run uses a fixture-backed orchestrator state file because the repository does not ship with a live `data/training-orchestrator-jobs.json`.
- Runtime deployments write the same report shape to `data/post-training-cadence/` when cadence automation is enabled.
