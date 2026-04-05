# MAY-P0-1 — Few-shot runner automation

## Kanban Status
- **Column:** Done
- **Owner:** Codex (GPT-5.3-Codex)
- **Last updated:** 2026-04-05

## Amy impact
- Speeds up model iteration so Amy can receive better personalized recognition faster.

## Scope
- Implement profile × shot × seed few-shot runner.
- Persist reproducible benchmark artifacts (`split_manifest`, `report`, `summary.json`, `summary.md`).

## Entry points
- `server/src/config/index.ts`
- `server/src/server.ts`
- `server/src/amyserver_tools/train_mlp.py`
- `server/src/amyserver_tools/train_mlp_fewshot.py`
- `server/test/test_train_mlp_fewshot.py`

## Evidence required for Done
- Runner committed plus generated artifacts in benchmark results.

## Evidence
- Added markdown summary output (`summary.md`) from `train_mlp_fewshot.py` so every run emits both machine-readable and human-readable reports.
- Verified server default runner path uses `train_mlp_fewshot.py` via config and runtime execution branch.
- Committed reproducible run artifacts and execution note:
  - `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/`
  - `docs/testing/benchmarks/results/2026-04-05/may-p0-1-runner-execution.md`

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Next command
- `pytest server/test/test_train_mlp_fewshot.py -q`
