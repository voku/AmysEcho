# Project Milestones

Development work is organized into milestone phases that align with Amy First delivery and release checkpoints.

## Completed Foundation (Phases 1–3)

The core platform is implemented and production-oriented:

- multimodal capture (hands, pose, face)
- bundle upload + server ingestion
- global/personalized model training
- model distribution and runtime loading
- reliability, health, and fallback pathways

## Current Milestone: v0.0.1 Stabilization & Tag Readiness

Focus: lock a trustworthy baseline tag for external contributors and reproducible deployments.

### Exit Criteria

- All major webapp/server/integration checks pass.
- Release readiness checklist in `docs/planning/RELEASE_0.0.1_READINESS.md` is complete.
- README/docs/AGENTS guidance reflects actual implementation.
- TODO list is curated to concrete post-tag priorities.

## Next Milestone: Post-Tag Operational Hardening

Focus: turn a stable baseline into a repeatable operations model.

- Add deeper stress/performance validation in realistic caregiver environments.
- Improve runbooks for incident response and rollback.
- Strengthen regression prevention around profile/account boundary conditions.

## Following Milestone: Accuracy & UX Refinement

Focus: improve communication quality without sacrificing reliability.

- Expand data quality guardrails for hard-to-capture gestures.
- Improve confidence tuning and feedback ergonomics.
- Continue accessibility validation for low-friction daily use.
