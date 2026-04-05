# Production Health Monitoring Ownership & Thresholds

**Last updated:** 2026-04-04  
**Scope:** release and runtime monitoring ownership for Amy's Echo webapp/server/integration flows.

## 1) Ownership matrix

| Monitoring area | Primary owner | Backup owner | Signal source | Escalation SLA |
| --- | --- | --- | --- | --- |
| API availability & latency (`/health`, critical APIs) | Backend on-call | Release captain | server health checks + integration smoke results | 15 minutes |
| Auth/session reliability (login, refresh, `401` recovery) | Backend on-call | Webapp on-call | auth route metrics + integration auth suite | 30 minutes |
| Gesture runtime continuity (camera start, detection loop, fallback) | Webapp on-call | QA coordinator | browser perf traces + runtime diagnostics | 30 minutes |
| Training pipeline continuity (upload → train → model download) | ML/Platform owner | Backend on-call | training queue metrics + integration E2E | 60 minutes |
| Accessibility/manual quality gate evidence | Accessibility owner | QA coordinator | quarterly manual artifacts | by release cut |

## 2) Alert thresholds (release gate + operations baseline)

| Metric | Threshold (warning) | Threshold (critical) | Action |
| --- | --- | --- | --- |
| Health endpoint availability | < 99.5% daily success | < 99.0% daily success | Incident triage, rollback assessment |
| `/api/v1/train-model` p95 latency | > 5s (3 consecutive samples) | > 8s (3 consecutive samples) | Investigate queue/process contention |
| `/api/v1/latest-mlp-model` p95 latency | > 2s (3 consecutive samples) | > 4s (3 consecutive samples) | Verify model registry/file IO path |
| Auth refresh failure rate | > 1.0% daily | > 2.0% daily | Investigate token/session regression |
| Integration critical-flow pass rate | < 100% on release candidate | < 100% on main for 2 runs | Block release; assign fix owner |
| Gesture runtime drop rate (benchmark sessions) | > 3% dropped frames | > 5% dropped frames | Re-run performance drill and tune pipeline |

## 3) Operating procedure

1. Confirm alert from at least two signals (metric + log or test evidence).
2. Assign incident commander (primary owner unless unavailable).
3. Determine user-facing impact to Amy/caregiver communication path.
4. Choose mitigation within 30 minutes (hotfix, rollback, feature guard).
5. Publish timeline + action record in an incident drill/report artifact.

## 4) Release gate requirements

Before release approval:
- owners in this document are current and reachable,
- no unresolved critical threshold breach without explicit mitigation + ETA,
- latest incident drill artifact exists in `docs/operations/`,
- latest accessibility cycle artifact is linked from release readiness docs.


## 5) 2026-04 ownership review checklist (JUN-P1-5)

- Review date: 2026-04-04
- Reviewed by: Release captain + Backend on-call

| Check | Result | Notes |
| --- | --- | --- |
| Primary/backup owners confirmed reachable | ✅ | No owner gaps identified in current rotation. |
| Escalation SLAs still match operational expectations | ✅ | Existing 15/30/60 minute SLAs retained. |
| Alert thresholds still aligned with current release gate policy | ✅ | No threshold changes required after Q2 network-impairment drill. |
| Latest drill and remediation artifacts linked | ✅ | `incident-drill-2026-04-04.md`, `ops-readiness-remediation-log-2026-04.md`. |

