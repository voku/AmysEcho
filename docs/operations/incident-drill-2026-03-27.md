# Incident Drill Report — 2026-03-27

**Scenario:** training pipeline degradation with rollback verification  
**Drill window:** 2026-03-27 14:00–14:42 UTC  
**Incident commander:** Backend on-call  
**Participants:** Webapp on-call, ML/Platform owner, QA coordinator

## 1) Timeline

| Time (UTC) | Event |
| --- | --- |
| 14:00 | Drill started; injected synthetic high-latency condition on training path. |
| 14:05 | Alert trigger observed (`/api/v1/train-model` p95 above warning threshold). |
| 14:09 | Confirmed user-facing risk: training completion feedback delayed. |
| 14:14 | Mitigation decision: rollback to previous stable training worker settings. |
| 14:22 | Rollback applied and verified by smoke checks. |
| 14:31 | p95 latency returned below baseline thresholds. |
| 14:42 | Drill closed; postmortem notes captured. |

## 2) Detection

- Primary signal: training API p95 latency threshold breach.
- Secondary signal: integration critical-flow check showed delayed training completion.
- Triage classification: **P1 (degraded but communication path still available).**

## 3) Mitigation and rollback evidence

- Mitigation selected within 15 minutes of alert confirmation.
- Rollback target: previously validated training worker configuration.
- Verification checks after rollback:
  - health endpoint stable,
  - upload → train → model download flow restored to baseline behavior,
  - no increase in auth/session failure rates.

## 4) Amy impact analysis

- Direct communication interruption: **none**.
- Indirect impact: delayed personalization/training turnaround during incident window.
- Guardrail effectiveness: rollback path restored training latency before communication quality degraded.

## 5) Postmortem

### What worked
- Alert threshold detected issue quickly.
- Incident ownership was clear.
- Rollback runbook steps were executable without ambiguity.

### Improvements
- Add an explicit pre-deploy check to catch worker-configuration regressions.
- Expand drill to include concurrent elevated load + degraded network profile.

### Follow-up actions
1. Add pre-release training-worker configuration diff check.
2. Run second drill in Q2 with network impairment variant.
