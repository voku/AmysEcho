# Repository Inventory Baseline

Generated: 2026-04-05 21:13:53 UTC

Tracked files: **1436**
Tracked size: **223.48 MB**

## Top-level fit map

| Root | Role | Files |
|---|---|---:|
| `server` | API + ML/training services and datasets | 692 |
| `webapp` | Frontend React + TypeScript communication UI | 369 |
| `docs` | Architecture, planning, operations, and runbooks | 238 |
| `scripts` | Automation and validation helpers | 50 |
| `skills` | Codex skill definitions | 32 |
| `.github` | CI and automation workflows | 15 |
| `integration` | End-to-end/integration tests | 13 |
| `deployment` | Deployment and environment configs | 11 |
| `spec` | Design/protocol specs | 2 |
| `.env.example` | Unclassified / utility | 1 |
| `.gitattributes` | Unclassified / utility | 1 |
| `.gitignore` | Unclassified / utility | 1 |
| `.idea` | Unclassified / utility | 1 |
| `.whitesource` | Unclassified / utility | 1 |
| `LICENSE` | Unclassified / utility | 1 |
| `readme.md` | Unclassified / utility | 1 |
| `agents.md` | Unclassified / utility | 1 |
| `data` | Shared baseline model/data assets | 1 |
| `docker-compose.yml` | Unclassified / utility | 1 |
| `package-lock.json` | Unclassified / utility | 1 |
| `package.json` | Unclassified / utility | 1 |
| `pyproject.toml` | Unclassified / utility | 1 |
| `renovate.json` | Unclassified / utility | 1 |

## File grouping snapshot

### By extension (top 15)

| Extension | Count |
|---|---:|
| `.ts` | 364 |
| `.mp4` | 329 |
| `.md` | 257 |
| `.json` | 202 |
| `.tsx` | 118 |
| `.py` | 77 |
| `.sh` | 19 |
| `.js` | 12 |
| `.yml` | 10 |
| `.yaml` | 8 |
| `.toml` | 7 |
| `.mjs` | 5 |
| `.gitignore` | 3 |
| `.task` | 3 |
| `.svg` | 3 |

### By size bucket

| Size bucket | Count |
|---|---:|
| <10KB | 1141 |
| 10KB-100KB | 165 |
| 1MB-10MB | 91 |
| 100KB-1MB | 39 |

### By last commit age

| Age | Count |
|---|---:|
| 0-30d | 1389 |
| unknown | 47 |

## Cleanup-first candidates

### Large tracked artifacts (top 20)

| File | Size (MB) |
|---|---:|

### Suspicious file names

- None

## Suggested cleanup phases

1. **History-safe artifact cleanup**: remove tracked generated/backups with `git rm --cached`, then enforce `.gitignore` patterns for equivalent paths.
2. **Naming normalization**: rename suspicious/quoted files to canonical lowercase snake-case filenames and update references.
3. **Test and mock colocation**: move ad-hoc fixtures from runtime data folders into `server/test/fixtures` or `integration/fixtures` where possible.
4. **Docs split/merge pass**: split oversized docs into index + focused sub-docs and archive stale docs under `docs/archive`.
5. **Automation**: re-run this inventory in CI and fail if tracked artifact budget is exceeded.

## Machine-readable data

See `docs/analysis/repo-inventory-2026-04-05.summary.json` for aggregated metadata.
