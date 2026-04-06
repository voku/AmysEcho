# Post-Training Operations Cadence

**Last updated:** 2026-04-06  
**Scope:** cron/system-timer-safe reconciliation, retention review, and summary generation for orchestrator-managed training jobs.

## 1) Purpose

This cadence converts one-off training hardening into a repeatable operational loop without delaying upload-triggered training.

- Upload-triggered training remains the low-latency path.
- Cadence work is strictly follow-up automation: reconciliation, retention review, and operator summaries.
- Source of truth for job state is `DATA_DIR/training-orchestrator-jobs.json` from `JUN-P1-7`.

## 2) Cadence table

| Step | Frequency | Dry-run or live | Owner | Output |
| --- | --- | --- | --- | --- |
| Reconciliation summary | Every 6 hours | Live | ML/Platform owner | `data/post-training-cadence/latest.{json,md}` |
| Retention review | Every 6 hours | Live | Backend on-call | stale completed/failed jobs older than retention window are pruned, retry-eligible restart interruptions are preserved |
| Manual evidence snapshot | Before release cut or major ops change | Dry-run | Release captain | committed report under `docs/operations/` |

## 3) Safety rules

1. Never block or serialize the upload-triggered training queue behind cadence work.
2. Treat `failed` jobs with restart interruption reason as **retry-eligible**; they must be surfaced in summaries and must not be silently pruned.
3. Only completed jobs and non-retry-eligible failed jobs older than the retention window are prune candidates.
4. If cadence execution fails, leave the job state file untouched and escalate through normal ops channels.

## 4) Commands

### 4.1 Manual dry-run

```bash
npm run build --prefix server
npm run ops:post-training-cadence --prefix server -- --dry-run
```

### 4.2 Manual live run with explicit retention

```bash
npm run build --prefix server
npm run ops:post-training-cadence --prefix server -- --retention-days 14
```

### 4.3 Queue-depth snapshot for drills and runbooks

```bash
curl -s http://localhost:5000/health | jq '{pendingTrainingJobs}'
curl -s -H "Authorization: Bearer <token>" http://localhost:5000/api/v1/train-status/cadence/latest
```

## 5) Scheduling

### Cron

```bash
0 */6 * * * cd /srv/amysecho && /usr/bin/npm run ops:post-training-cadence --prefix server >> /var/log/amysecho-post-training-cadence.log 2>&1
```

### systemd timer

Use a service that runs:

```bash
/usr/bin/npm run ops:post-training-cadence --prefix /srv/amysecho/server
```

Set the timer to `OnCalendar=*-*-* 00/6:00:00`.

## 6) Failure handling

| Failure | Expected behavior | Operator action |
| --- | --- | --- |
| Missing state file | Summary still emits with zero jobs | Verify whether orchestrator has ever queued a job in this environment |
| Restart-interrupted jobs present | Summary lists them as retry-eligible | Re-queue intentionally; do not prune |
| Report write failure | Cadence run fails fast | Check filesystem permissions and rerun |
| Unexpected active queue growth | Summary still excludes active jobs from retention | Inspect `/health`, active training jobs, and recent upload volume |

## 7) Evidence paths

- Runtime reports: `data/post-training-cadence/latest.json`, `data/post-training-cadence/latest.md`
- Operator endpoint: `/api/v1/train-status/cadence/latest`
- Committed dry-run example: `docs/operations/post-training-cadence-dry-run-2026-04-06.md`
