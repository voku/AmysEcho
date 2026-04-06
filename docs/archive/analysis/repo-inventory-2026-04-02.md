# Repository Inventory Baseline

Generated: 2026-04-02 19:18:09 UTC

Tracked files: **1432**
Tracked size: **873.98 MB**

## Top-level fit map

| Root | Role | Files |
|---|---|---:|
| `server` | API + ML/training services and datasets | 744 |
| `webapp` | Frontend React + TypeScript communication UI | 369 |
| `docs` | Architecture, planning, operations, and runbooks | 182 |
| `scripts` | Automation and validation helpers | 49 |
| `skills` | Codex skill definitions | 32 |
| `.github` | CI and automation workflows | 15 |
| `integration` | End-to-end/integration tests | 13 |
| `deployment` | Deployment and environment configs | 11 |
| `data` | Shared baseline model/data assets | 2 |
| `spec` | Design/protocol specs | 2 |
| `.env.example` | Unclassified / utility | 1 |
| `.gitattributes` | Unclassified / utility | 1 |
| `.gitignore` | Unclassified / utility | 1 |
| `.idea` | Unclassified / utility | 1 |
| `.whitesource` | Unclassified / utility | 1 |
| `AGENTS.md` | Unclassified / utility | 1 |
| `LICENSE` | Unclassified / utility | 1 |
| `readme.md` | Unclassified / utility | 1 |
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
| `.mp4` | 315 |
| `.md` | 215 |
| `.json` | 173 |
| `.tsx` | 118 |
| `.zip` | 83 |
| `.py` | 75 |
| `.sh` | 19 |
| `.js` | 12 |
| `.yml` | 10 |
| `.yaml` | 8 |
| `.toml` | 7 |
| `.mjs` | 5 |
| `.gitignore` | 3 |
| `.task` | 3 |

### By size bucket

| Size bucket | Count |
|---|---:|
| <10KB | 1143 |
| 10KB-100KB | 155 |
| 1MB-10MB | 88 |
| 100KB-1MB | 38 |
| >10MB | 8 |

### By last commit age

| Age | Count |
|---|---:|
| 31-90d | 1083 |
| 0-30d | 330 |
| unknown | 19 |

## Cleanup-first candidates

### Large tracked artifacts (top 20)

| File | Size (MB) |
|---|---:|
| `server/data/backups/profiles/fc558821-e321-4dd6-9ca5-be89e00aa43a/1767032611811_1762f5754e4c7921ce30154aa674ad427945f928a0f397e4a0153c35a4dcb0ae.zip` | 89.81 |
| `server/data/backups/profiles/fc558821-e321-4dd6-9ca5-be89e00aa43a/1767125552643_e7e15bc6832484bc69eb860d232cae1b4c5487c412bddcf1dd830d8e991d0dd8.zip` | 89.81 |
| `server/data/backups/profiles/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/1767047581063_1206331cf888f87375adf9a664a117ff3a1d8a866a6204c55bd3972589548be9.zip` | 89.48 |
| `server/data/backups/profiles/a75031a7-2902-4d43-b3c8-d537728fceef/1767125548387_10a2016c960fa5f778dc411e10070b1e94af620c48f6a786b0c4192ac3e134b2.zip` | 89.16 |
| `server/data/backups/profiles/e3251d3e-1ab8-4bc1-93af-4d3e924e4272/1767032617075_f223967f47c3d9f2eebc826867b223f56064440b9c373536dd3e4f22f1c3bd29.zip` | 89.16 |
| `server/data/backups/profiles/e3251d3e-1ab8-4bc1-93af-4d3e924e4272/1767125557096_9de25a32a69b54baff35465ffd097498a3db5d39b66d74d47b683b1ed4883f41.zip` | 89.16 |
| `server/data/backups/profiles/14f61335-0b6d-4c47-aac9-021a0932a5ae/1767125544040_1a08f512c1c220b9bf057bd5b5ddba938f9dd08fdec95442787ef6ccd1754ee4.zip` | 89.15 |
| `data/amy_model.npz` | 32.87 |

### Suspicious file names

- None

## Suggested cleanup phases

1. **History-safe artifact cleanup**: remove tracked generated/backups with `git rm --cached`, then enforce `.gitignore` patterns for equivalent paths.
2. **Naming normalization**: rename suspicious/quoted files to canonical lowercase snake-case filenames and update references.
3. **Test and mock colocation**: move ad-hoc fixtures from runtime data folders into `server/test/fixtures` or `integration/fixtures` where possible.
4. **Docs split/merge pass**: split oversized docs into index + focused sub-docs and archive stale docs under `docs/archive`.
5. **Automation**: re-run this inventory in CI and fail if tracked artifact budget is exceeded.

## Machine-readable data

See `docs/analysis/repo-inventory-2026-04-02.summary.json` for aggregated metadata.
