# Repository Cleanup Plan (Inventory-Driven)

**Date:** 2026-04-02  
**Scope:** repository structure, tracked artifact hygiene, docs split strategy, and test/mock organization.  
**Inputs reviewed first:** `docs/planning/todo.md`, `docs/files.md`, and generated inventory artifacts:
- `docs/analysis/repo-inventory-2026-04-02.md`
- `docs/analysis/repo-inventory-2026-04-02.summary.json`

> Note: commit only summarized inventory artifacts. Full per-file exports are local-only (`--include-files`) and should not be committed.
> Detailed file-by-file action backlog: `docs/planning/repository-cleanup-file-backlog-2026-04-02.md`.

## 1) Current state snapshot (from tracked Git files)

- **Tracked files:** 1,432
- **Tracked size:** 873.98 MB
- **Largest top-level area by far:** `server/` (~836.34 MB)
- **Largest subtrees:**
  - `server/data/backups/` (~625.81 MB, mostly `.zip` backups)
  - `server/data/dgs_video_examples/` (~192.39 MB)
  - `data/amy_model.npz` (~32.87 MB)

### Extension profile (top)

- `.ts`: 364
- `.mp4`: 315
- `.md`: 212
- `.json`: 172
- `.tsx`: 118
- `.zip`: 83

## 2) Cleanup goals (LLM + contributor efficiency)

1. **Reduce tracked non-source artifact weight** so clone/checkouts are faster.
2. **Keep runtime data separate from test fixtures/mocks** to avoid accidental coupling.
3. **Split oversized docs and preserve a searchable index** for future LLM agents.
4. **Automate repository inventory checks** so drift is caught in CI.

## 3) Planned cleanup workstream

## Phase A — Git hygiene and artifact policy (highest impact)

### A1. Remove generated backups from tracking history going forward

The repository already ignores `server/data/backups/`, but many files remain tracked. Execute a history-safe first step:

```bash
git rm -r --cached server/data/backups
```

Then commit so `.gitignore` can actually protect this path in future commits.

### A2. Clarify model/data tracking policy

Decide and codify which binary assets are:
- **Required for runtime** (tracked),
- **Test fixtures only** (move under test fixture roots),
- **Generated artifacts** (untracked, gitignored, reproducible by scripts).

Candidate files for policy decision:
- `data/amy_model.npz`
- `server/data/models/*.task`
- `server/data/dgs_video_examples/*` (mix of video + landmark JSON)

### A3. Add a tracked-size budget check

Use `scripts/repo_inventory.py` in CI to fail when either threshold is exceeded:
- total tracked size budget,
- number of tracked files over size threshold (e.g., >10 MB),
- forbidden tracked prefixes (e.g., `server/data/backups/`).

## Phase B — Structure cleanup (split/move/copy)

### B1. Move test-only data into test fixtures

Target rule:
- runtime data: `server/data/**`
- test fixtures: `server/test/fixtures/**` and `integration/fixtures/**`

Actions:
1. Inventory references to files under `server/data/dgs_video_examples/` in tests.
2. For test-only files, move/copy them into `server/test/fixtures/dgs_video_examples/`.
3. Update tests to reference fixture paths.
4. Keep only production-required sample assets under runtime data.

### B2. Webapp fixture/mock alignment

Current test data exists in both:
- `webapp/src/gesture/__fixtures__`
- `webapp/src/gesture/testing/fixtures`

Plan:
1. Pick one primary fixture root (`webapp/src/gesture/testing/fixtures`).
2. Migrate single-use leftovers from `__fixtures__` when practical.
3. Keep `__mocks__` only for module mocking boundaries.

### B3. Documentation split policy

For docs larger than practical LLM context chunks, use:
- an index document (`README`/overview),
- focused child docs with explicit links,
- archive stale versions to `docs/archive/` with date stamps.

Initial candidates should be selected by line count + stale link churn in a follow-up pass.

## Phase C — Operational guardrails (prevent regression)

1. Add a `repo-inventory` script target in root scripts (`package.json` or shell helper).
2. Regenerate `docs/analysis/repo-inventory-*.{md,json}` in scheduled CI (weekly/monthly).
3. Add an explicit cleanup checklist to PR template:
   - any new binary?
   - generated or source-of-truth?
   - fixture vs runtime location correct?
   - `.gitignore` updated?

## 4) Execution order (recommended)

1. **A1** (untrack backups) — immediate high ROI.
2. **A2** (binary data policy) — unblock confident file moves/deletions.
3. **B1/B2** (test/mock re-homing) — reduce coupling and confusion.
4. **B3** (docs split) — improve LLM onboarding and maintenance.
5. **A3 + C** (automation gates) — keep repository clean over time.

## 5) Handoff notes for another LLM

If you continue this plan, start with these commands:

```bash
python scripts/repo_inventory.py
python - <<'PY'
import glob
import json
latest = sorted(glob.glob('docs/analysis/repo-inventory-*.summary.json'))[-1]
p=json.load(open(latest))
print('inventory_file', latest)
print('tracked', p['tracked_file_count'])
print('size_mb', p['tracked_total_size_mb'])
print('largest tracked artifact', p['cleanup_candidates']['tracked_large_artifacts'][0])
PY
```

Then execute Phase A1 and re-run inventory to confirm deltas.
