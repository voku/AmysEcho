# Outdated Docs Audit (2026-03-27)

## Method used

1. Candidate discovery from planning docs with potentially stale release/milestone scope.
2. Last-change verification via `git log -1 --date=short --format='%ad %h' -- <file>`.
3. Logic check against current execution source (`docs/planning/TODO.md`) and current release posture.
4. Action decision: keep, merge, or delete.
5. Code-reality spot checks on roadmap entry points and canonical docs before keeping any document as active guidance.

## Scope note

This checkout is shallow, so for some files the oldest locally visible pre-consolidation history is the merge commit `dc87218` from 2026-03-26. Decisions below use the newest locally available git timestamp plus direct comparison against the current canonical docs and repository tree.

## Candidate decisions

| File | Last changed (git) | Logic check | Decision |
|---|---|---|---|
| `docs/planning/RELEASE_0.0.1_READINESS.md` | 2026-03-02 (`3c7fbbb`) | Tag-specific gate for an already superseded release; post-v0.0.1 priorities are now covered in newer planning docs. | **Delete** |
| `docs/planning/ProjectMilestones.md` | 2026-03-03 (`7ba6e86`) | Milestone narrative duplicates active timeline now tracked in `docs/planning/TODO.md` (Apr–Jul 2026 roadmap). | **Delete** |
| `docs/planning/RELEASE_0.0.2_READINESS.md` | 2026-03-25 (`ebae288`) | Still useful as historical release evidence and gate template; required links need refresh after doc cleanup. | **Keep + update references** |
| `docs/architecture.md`, `docs/build-system.md`, `docs/deployment.md`, `docs/development.md`, `docs/testing.md`, `docs/project-overview.md` | 2026-03-26 (`dc87218`) pre-consolidation content; 2026-03-27 (`695fe06`) pointer conversion | Current canonical content already lives under `docs/architecture/`, `docs/deployment/`, `docs/testing/`, `docs/workflows/`, and `docs/README.md`. No remaining internal markdown links depend on these top-level files, but they are still valuable as compatibility pointers for bookmarked/external paths. | **Keep as short compatibility pointers only** |
| `docs/planning/CAMERA_BLIND_SPOT_ANALYSIS_2026-03-21.md` | 2026-03-21 (`e48fd6f`) original analysis; 2026-03-27 (`695fe06`) archival status update | The analysis still contains useful historical evidence for camera-start/performance work, but active execution now belongs in `docs/planning/TODO.md` and the broader external/runtime synthesis lives in `docs/analysis/EXTERNAL_BEST_PRACTICES_BLIND_SPOT_ANALYSIS_2026-03-27.md`. | **Keep as clearly archived evidence** |
| `docs/analysis/ML_MODEL_TRAINING_USAGE_BLIND_SPOT_ANALYSIS_2026-02-24.md`, `docs/analysis/WEBAPP_TRAINED_MODEL_USABILITY_BLIND_SPOT_ANALYSIS_2026-02-25.md` | 2026-03-26 (`dc87218`) last locally visible pre-deletion history; 2026-03-27 (`695fe06`) removal | Both were superseded by `docs/analysis/CONSOLIDATED_MODEL_RUNTIME_BLIND_SPOT_ANALYSIS_2026-03.md`, which carries the active runtime/model decisions. Keeping the older files would duplicate guidance and split decision ownership. | **Delete** |
| `docs/analysis/FULL_WORKFLOW_BLIND_SPOT_ANALYSIS.md`, `docs/analysis/BLIND_SPOT_ANALYSIS_2026-03-08.md` | 2026-03-26 (`dc87218`) last locally visible pre-deletion history; 2026-03-27 (`695fe06`) removal | Both duplicated workflow-level blind-spot content now merged into `docs/analysis/CONSOLIDATED_WORKFLOW_ALIGNMENT_BLIND_SPOT_ANALYSIS_2026-03.md`. Active workflow tasks are tracked only in `docs/planning/TODO.md`. | **Delete** |

## Resulting changes

- Removed stale planning docs that duplicated or superseded current planning scope.
- Kept v0.0.2 readiness evidence document, but updated it to reference canonical docs only.
- Kept top-level quick-reference filenames as minimal compatibility pointers instead of deleting them outright.
- Kept the camera blind-spot note as archived evidence with explicit status instead of leaving it ambiguous.
- Centralized forward plan in `docs/planning/TODO.md`, and corrected roadmap drift where an outdated worker path no longer matched the repository tree.
