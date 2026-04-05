# Incident Drill Report — 2026-04-04

**Scenario:** network impairment + training queue backlog with rollback verification  
**Drill window:** 2026-04-04 09:00–09:49 UTC  
**Incident commander:** Backend on-call  
**Participants:** Webapp on-call, ML/Platform owner, QA coordinator, Release captain

## 1) Timeline

| Time (UTC) | Event |
| --- | --- |
| 09:00 | Drill started; injected synthetic network impairment profile (high packet loss + latency spikes). |
| 09:06 | Alert trigger observed (`/api/v1/train-model` p95 crossed warning threshold and queue depth trend increased). |
| 09:11 | Confirmed user-facing risk: delayed training status updates and slower model availability after upload. |
| 09:17 | Mitigation decision: rollback to previous worker concurrency + retry backoff profile. |
| 09:26 | Rollback applied; health endpoint + training jobs endpoint checks stable. |
| 09:38 | Queue depth returned to baseline band; p95 below warning threshold for 3 consecutive samples. |
| 09:49 | Drill closed; remediation ownership and follow-up dates captured. |

## 2) Detection

- Primary signal: training API latency threshold breach with queue depth increase.
- Secondary signal: upload → train → model-download drill path exceeded normal completion window.
- Triage classification: **P1 (degraded training continuity, communication path remains available).**

## 3) Mitigation and rollback evidence

- Mitigation selected within 11 minutes of confirmed user-facing risk.
- Rollback target: previously validated training worker profile from prior stable baseline.
- Verification checks after rollback:
  - `/health` and `/api/v1/health` both stable,
  - training jobs status endpoint recovers to baseline queue depth,
  - upload → train → model download flow returns to expected completion band,
  - no concurrent increase in auth/session recovery failures.

## 4) Amy impact analysis

- Direct communication interruption: **none**.
- Indirect impact: temporary delay in personalization turnaround under degraded network conditions.
- Guardrail effectiveness: rollback path restored training responsiveness before caregiver-visible confusion in critical communication flow.

## 5) Postmortem

### What worked
- Alert + queue-depth cross-signal reduced false-positive risk.
- Incident ownership was explicit and escalation path was executed on time.
- Rollback runbook steps were deterministic and verifiable.

### Improvements
- Add explicit dashboard annotation guidance for planned network drills to simplify artifact review.
- Add a quick command block in runbooks for queue-depth snapshot capture at drill start/end.

### Follow-up actions
1. Add drill annotation checklist to ops runbook (`owner: Backend on-call`, due `2026-04-11`).
2. Add queue snapshot command snippet to drill template (`owner: ML/Platform owner`, due `2026-04-11`).
3. Re-run a compressed 20-minute verification drill once both runbook updates are merged (`owner: Release captain`, due `2026-04-18`).
