# supported-core-evidence-archive — Archive one-off planning evidence docs

## Kanban Status
- **Column:** Done
- **Owner:** Team
- **Last updated:** 2026-04-07

## Amy impact
- Keeps active planning focused on current communication-critical work while preserving historical evidence needed for safe future decisions.

## Scope
- Move dated one-off planning analyses, trackers, and decision notes out of active `docs/planning/`.
- Preserve them under `docs/archive/planning/` instead of deleting useful provenance.
- Update references so topic boards and archive audits point to the archived paths.

## Entry points
- `docs/planning/todo.md`
- `docs/planning/todo-done.md`
- `docs/archive/planning/`
- `docs/planning/topics/JUN-P1-7/topic.md`

## Evidence required for Done
- Dated one-off evidence docs no longer appear in active `docs/planning/`.
- References to moved files resolve to `docs/archive/planning/`.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Link references updated
- [x] Evidence recorded

## Evidence
- Archived six dated planning evidence docs: camera blind-spot analysis, documentation consolidation tracker, JUN-P1-7 decision note, repository cleanup plan/backlog, and topic-board blind-spot analysis.
- `find docs/planning -maxdepth 2 -type f | sort` now shows only active planning docs plus `topics/readme.md`.
- `rg` reference check shows moved-file references point to `docs/archive/planning/`.
- `python3 scripts/validate_docs_links.py` passes after updating stale local links surfaced during this cleanup.

## Next command
- `find docs/planning -maxdepth 2 -type f | sort && rg -n "docs/planning/.*2026-" docs && python3 scripts/validate_docs_links.py`
