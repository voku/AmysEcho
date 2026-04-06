# Post-training cadence summary

- Generated at: `2026-04-06T00:33:30.373Z`
- Dry run: `yes`
- Retention days: `14`
- Source state file: `/home/lars/Projects/AmysEcho/server/test/fixtures/post-training-cadence/training-orchestrator-jobs.json`

## Totals

| Metric | Value |
| --- | ---: |
| Total jobs | 4 |
| Queued | 0 |
| Running | 1 |
| Completed | 1 |
| Failed | 2 |
| Retry-eligible interrupted | 1 |
| Retention candidates | 2 |

## Reconciliation notes

- 1 restart-interrupted job(s) remain retry-eligible and must not be silently pruned.
- 1 active job(s) remain in queued/running state and were excluded from retention decisions.

## Retry-eligible interrupted jobs

| Job ID | User ID | Completed at | Error |
| --- | --- | --- | --- |
| job-failed-retry | 22222222-2222-4222-8222-222222222222 | 2026-04-05T08:04:00.000Z | Training durch Server-Neustart unterbrochen. Bitte erneut starten. |

## Retention candidates

| Job ID | User ID | Status | Completed at |
| --- | --- | --- | --- |
| job-completed-stale | 11111111-1111-4111-8111-111111111111 | completed | 2026-03-20T09:12:00.000Z |
| job-failed-stale | 33333333-3333-4333-8333-333333333333 | failed | 2026-03-18T11:07:00.000Z |
