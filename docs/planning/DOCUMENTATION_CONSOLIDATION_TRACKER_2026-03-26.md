# Documentation Consolidation Tracker (2026-03-26)

## Goal

Reduce documentation drift by consolidating highly similar documents, starting with analysis and blind-spot artifacts, while preserving historical traceability.

## Why this helps Amy

- Faster contributor onboarding means less implementation delay for communication-critical fixes.
- Fewer conflicting documents lowers the risk of wrong implementation choices in training, recognition, and profile safety flows.
- A single canonical path for active guidance improves release reliability.

## Phase 1 scope: analysis + blind-spot consolidation

### Cluster A — `docs/analysis/` blind-spot files

| Status | Action | Result |
|---|---|---|
| ✅ Completed | Create canonical analysis index | `docs/analysis/README.md` now points to active canonical docs. |
| ✅ Completed | Add metadata tags for filtering (`scope`, `status`, `tracked_in`) | Added front matter to active analysis docs. |
| ✅ Completed | Add backlinks to TODO tracking | Active analysis docs include `tracked_in: docs/planning/TODO.md`. |
| ✅ Completed | Merge overlapping docs and retire superseded files | Four overlapping analysis docs removed after distillation into two canonical decision docs. |

### Cluster B — planning blind-spot docs vs TODO

| Status | Action | Result |
|---|---|---|
| ✅ Completed | Normalize execution source-of-truth language | Dated camera analysis now states TODO is source of truth. |
| ✅ Completed | Add active/archived marker to dated planning analysis | `docs/planning/CAMERA_BLIND_SPOT_ANALYSIS_2026-03-21.md` now marked as archived context. |

### Cluster C — archived blind-spot reports

| Status | Action | Result |
|---|---|---|
| ✅ Completed | Create archive index and superseded chains | Added `docs/archive/BLIND_SPOT_ARCHIVE_INDEX.md`. |

## Consolidation operating rules

1. Do not delete historical analysis documents without a replacement reference.
2. For active work, keep acceptance criteria and ownership only in `docs/planning/TODO.md`.
3. In dated analyses, keep deep reasoning and evidence; move execution checklists to TODO.
4. When merging overlapping docs, preserve links to source files for auditability.

## Definition of done for this phase

- [x] `docs/analysis/README.md` exists and is used as the folder entry point.
- [x] Blind-spot clusters now have explicit active-vs-archive ownership documented.
- [x] Follow-up consolidation tasks are captured with concrete file targets.
- [x] Overlapping analysis docs were retired after distillation into canonical decision docs.


## Phase 2 scope: top-level quick-reference docs

| Status | Action | Result |
|---|---|---|
| ✅ Completed | Establish a canonical documentation hub | Added `docs/README.md` as primary entry point. |
| ✅ Completed | De-duplicate root quick-reference docs by turning them into compatibility pointers | Replaced `docs/deployment.md`, `docs/development.md`, `docs/testing.md`, `docs/architecture.md`, `docs/build-system.md`, and `docs/project-overview.md` with short canonical links. |
| ✅ Completed | Normalize source-of-truth language | All replaced stubs now point to `docs/planning/TODO.md` for active execution status. |
