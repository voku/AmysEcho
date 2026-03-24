# Amy's Echo v0.0.2 Release Notes (Draft)

Release date target: **March 2026**  
Status: **Draft for review**

## Scope

v0.0.2 focuses on reliability and production-readiness for Amy's visual DGS communication loop:

- Stabilized profile-aware training and model distribution paths.
- Hardened training-bundle ingestion, including concurrency stress coverage.
- Improved multimodal quality checks for pose/face availability in training recordings.
- Added startup telemetry milestones for camera + detector readiness to make regressions measurable.
- Repaired webapp quality-gate health (type-check, lint, build, coverage) after Metacom/admin regressions.
- Strengthened profile-safe backup/export/restore workflows for caregiver continuity.

## Key Improvements

### 1. End-to-end profile recognition reliability
- Fixed the profile-model regression where completed training did not reliably produce usable ranked predictions.
- Added/updated integration coverage to ensure trained profile models are actually used and return ranked label candidates.

### 2. Deterministic training runtime
- Standardized Python execution expectations across app runtime, tests, and integration paths.
- Reduced machine-to-machine drift caused by ad-hoc local Python environments.

### 3. Backup/restore continuity for caregivers
- Completed browser backup import + archive export/restore pathways.
- Added route-level coverage for backup listing/export/restore APIs.
- Clarified full-profile restore vs browser-only backup flows.

### 4. Performance and observability groundwork
- Added startup telemetry events:
  - `camera_start_requested_at`
  - `camera_stream_ready_at`
  - `detector_first_frame_at`
  - derived `startup_latency_ms`
- Added adaptive camera constraints fallback policy for weak hardware.

### 5. Training data quality hardening
- Added non-manual marker quality checks with test coverage:
  - pose coverage threshold
  - face coverage threshold
  - German guidance messaging assertions
- Added stress tests for concurrent training-bundle ingestion/retry bursts.

### 6. Full-stack integration reliability hardening
- Integration runner timeout handling is now CI-aware/configurable (`INTEGRATION_GLOBAL_TIMEOUT_MS`).
- Video-upload integration setup now waits on the latest unique training poll job, reducing redundant wait loops while preserving end-to-end coverage.
- Full integration command `cd integration && node test-runner.js ci` completed with 14/14 passing in pre-tag verification.

## Known Limitations (v0.0.2)

1. **Field-device performance evidence is incomplete**
   - Long-session measurements (FPS/thermal/battery) are not yet published for the target caregiver device matrix.
   - Risk: real-world thermal/battery behavior may diverge from CI/lab expectations.

2. **Worker offload for detection is not yet validated**
   - The main-thread frame-processing offload prototype has not been completed and benchmarked.
   - Risk: UI responsiveness can degrade on weaker devices under sustained load.

3. **Operational incident drill evidence is still pending**
   - Runbook expansion with documented incident + rollback drills is not yet finished.
   - Risk: slower incident response when failures occur in production.

4. **Terminology quality gate is not automated yet**
   - No enforced automated check currently prevents sign-language terminology regressions in user-facing copy.
   - Risk: inconsistent wording can re-enter the product.

## Mitigations and Ownership

| Limitation | Immediate Mitigation | Owner | Follow-up Target |
| --- | --- | --- | --- |
| Long-session device baselines missing | Use current startup telemetry and adaptive camera fallback; prioritize manual spot checks on available Android + laptop hardware before wider rollout | Webapp/Performance | Q2 2026 |
| Worker offload not shipped | Keep conservative camera constraints downgrade policy active; monitor latency metrics and regressions | Webapp/Recognition | Q2 2026 prototype decision |
| Runbook drill evidence missing | Use existing production checklist + release readiness checklist for controlled deploys; schedule first formal rollback drill | Ops/Reliability | Q2 2026 |
| Terminology gate missing | Require manual review for "Gebärde" terminology in release QA checklist until automated gate lands | Product + QA | Q2 2026 |

## Rollback Notes

If severe regressions are found after deploy:

1. Roll back to the previous production artifact/tag.
2. Keep existing persisted profile data intact; avoid destructive migrations during rollback.
3. Re-validate:
   - authentication/session flow
   - active profile selection
   - training upload + train-model route
   - latest model download path
   - German UX critical screens
4. Re-open the release Go/No-Go checklist before re-attempting rollout.

## Suggested Validation Before Final Publish

- Re-run the full release readiness command set documented in `docs/planning/RELEASE_0.0.2_READINESS.md`.
- Attach command outputs and functional checklist evidence links to the final release ticket.
- Confirm unresolved limitations and owners are still accurate at publication time.
