# Repository Cleanup File Backlog (Actionable)

**Date:** 2026-04-02  
**Purpose:** convert inventory findings into concrete file operations (remove/move/split/rename) with symmetry-first conventions for both humans and LLMs.

## 1) Discovery coverage completed

Reviewed:
- `docs/planning/TODO.md`
- `docs/files.md`
- `docs/analysis/repo-inventory-2026-04-02.md`
- `docs/analysis/repo-inventory-2026-04-02.summary.json`

Current tracked baseline from summary inventory:
- tracked files: **1430**
- tracked size: **873.95 MB**
- dominant area: `server/` due to `server/data/backups/` and `server/data/dgs_video_examples/`

## 2) Concrete cleanup targets (with file groups)

| Priority | Group | Current footprint | Problem | Planned operation |
|---|---|---:|---|---|
| P0 | `server/data/backups/` | 82 files / ~625.81 MB | Generated backups are tracked even though path is ignored | `git rm -r --cached server/data/backups` and keep only local/runtime backups |
| P0 | `server/data/dgs_video_examples/` | 403 files / ~177.40 MB | Runtime + test usage mixed; test coupling to production data | Split into runtime-required subset vs test fixtures; move fixture subset to `server/test/fixtures/dgs_video_examples/` |
| P1 | large binary roots (`data/amy_model.npz`, `server/data/models/*.task`) | 3 files / ~45.84 MB | no explicit artifact policy in one place | create tracked-binary allowlist doc + enforce by CI inventory budget |
| P1 | IDE artifact `.idea/workspace.xml` | 1 file | editor-local noise in repo root | remove from tracking and add scoped ignore rule if still needed |
| P1 | docs naming asymmetry (`docs/**/*.md`) | 175 markdown files with mixed naming styles | hard to predict paths (UPPERCASE, PascalCase, kebab mixed) | standardize naming convention + staged rename map with redirects/index links |
| P2 | fixture path asymmetry (webapp/server/integration) | scattered fixture roots | harder to discover test data ownership | normalize fixture roots and naming conventions per domain |

## 3) Specific file-level candidates to move/copy

### A) Integration tests currently tied to runtime `server/data`

These tests currently read from runtime data paths and should move to dedicated fixture bundles:

- `integration/test/webapp-video-upload.test.ts`
  - reads from `server/data/dgs_video_examples` for clip bytes and landmark JSON
- `integration/test/helpers/server.ts`
  - points server helper to `server/data/dgs_video_examples`

**Planned change:** copy only needed samples into `integration/fixtures/dgs_video_examples/` and update helper/test path constants.

### B) Server tests with runtime-data dependency

- `server/test/mediapipe-integration.test.ts` uses `../data/dgs_video_examples` and `../data/dgs_manifest.json`
- `server/test/test_landmark_integrity.py` validates files under `server/data/dgs_video_examples`

**Planned change:**
- keep one minimal canonical runtime smoke dataset,
- move broader regression fixtures to `server/test/fixtures/dgs_video_examples/`,
- parameterize tests to select fixture root first.

### C) Webapp fixture asymmetry

Current fixture/mock roots:
- `webapp/src/gesture/testing/fixtures/`
- `webapp/src/gesture/__fixtures__/`
- `webapp/src/gesture/__mocks__/`
- `webapp/src/training/__fixtures__/`

**Planned change:**
- keep `__mocks__/` only for module mocking boundaries,
- standardize fixtures under `<domain>/testing/fixtures/` where possible,
- migrate one-off `__fixtures__` files to domain fixture roots and update imports.

## 4) Symmetry + naming conventions (new baseline)

## Directory symmetry

- Runtime data: `server/data/<domain>/...`
- Server test fixtures: `server/test/fixtures/<domain>/...`
- Integration fixtures: `integration/fixtures/<domain>/...`
- Webapp test fixtures: `webapp/src/<domain>/testing/fixtures/...`

## File naming symmetry

- Prefer lowercase kebab-case for docs and scripts: `topic-scope-date.md`
- Keep acronyms lowercase in filenames (`api`, `dgs`, `llm`) for predictable matching
- Keep date suffix format as `YYYY-MM-DD`

## 5) Execution plan by PR slices

### PR-1 (P0 storage relief)

1. Untrack `server/data/backups/`.
2. Re-run inventory; verify tracked-size drop.
3. Add CI check to fail if tracked files exist under forbidden prefixes.

### PR-2 (P0/P1 fixture separation)

1. Inventory exact samples referenced by integration/server tests.
2. Copy/move required samples to fixture roots.
3. Update tests/helpers to fixture-first path resolution.
4. Keep runtime data minimal and explicitly documented.

### PR-3 (P1 naming + symmetry)

1. Publish naming convention doc for repository artifacts.
2. Rename a first safe batch of docs to kebab-case (with index updates).
3. Update all internal links + route inventory references where needed.

## 6) Ready-to-run command checklist for next LLM

```bash
python scripts/repo_inventory.py
rg -n "server/data/dgs_video_examples|server/data/dgs_manifest" server/test integration/test webapp/src
git ls-files server/data/backups
git ls-files .idea
```

Use these results to prepare PR-1 and PR-2 with explicit before/after inventory numbers.
