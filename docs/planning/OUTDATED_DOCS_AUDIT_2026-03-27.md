# Outdated Docs Audit (2026-03-27)

## Method used

1. Candidate discovery from planning docs with potentially stale release/milestone scope.
2. Last-change verification via `git log -1 --date=short --format='%ad %h' -- <file>`.
3. Logic check against current execution source (`docs/planning/TODO.md`) and current release posture.
4. Action decision: keep, merge, or delete.

## Candidate decisions

| File | Last changed (git) | Logic check | Decision |
|---|---|---|---|
| `docs/planning/RELEASE_0.0.1_READINESS.md` | 2026-03-02 (`3c7fbbb`) | Tag-specific gate for an already superseded release; post-v0.0.1 priorities are now covered in newer planning docs. | **Delete** |
| `docs/planning/ProjectMilestones.md` | 2026-03-03 (`7ba6e86`) | Milestone narrative duplicates active timeline now tracked in `docs/planning/TODO.md` (Apr–Jul 2026 roadmap). | **Delete** |
| `docs/planning/RELEASE_0.0.2_READINESS.md` | 2026-03-25 (`ebae288`) | Still useful as historical release evidence and gate template; required links need refresh after doc cleanup. | **Keep + update references** |

## Resulting changes

- Removed stale planning docs that duplicated or superseded current planning scope.
- Kept v0.0.2 readiness evidence document, but updated it to reference canonical docs only.
- Centralized forward plan in `docs/planning/TODO.md`.
