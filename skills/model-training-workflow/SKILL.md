---
name: model-training-workflow
description: Execute Amy's Echo model training workflows end-to-end with reproducible evidence. Use when changing trainer code, training metadata contracts, model artifact handling, few-shot evaluation, or release-readiness checks for training outputs.
---

# Model Training Workflow

Run this workflow for any server-side model training or evaluation change.

## 0) Discovery & planning preflight

Before running training/evaluation commands:

1. Read `docs/planning/todo.md` and confirm current roadmap priorities.
2. Inspect existing implementation in `server/src/amyserver_tools/`, `server/training/`, and related tests.
3. Define a short plan using Discovery → Planning → Implementation → Verification workflow.

## 1) Scope the training surface

Inspect changed files and map to these areas:

- Trainer and few-shot orchestration: `server/src/amyserver_tools/`
- Training data and constants: `server/training/`, `server/data/`
- Training routes and serving contract: `server/src/routes/`
- Training tests: `server/test/`

## 2) Execute the minimum safe command sequence

Start with the smoke workflow, then targeted tests, then broader checks as needed.

1. `npm run train:workflow:smoke --prefix server`
2. `PY_BIN=$(node ./server/scripts/resolve-python-bin.mjs) && PYTHONPATH=./server/src:./server:./server/training "$PY_BIN" -m pytest -q server/test/test_train_mlp_sweep.py`
3. `npm run test:ts --prefix server -- latestMlpModelRoute.test.ts`
4. Add `npm test --prefix server` when contract risk is broad.

Use commands and escalation criteria in `references/command-ladder.md`.

## 3) Enforce reproducibility and leakage safety

For few-shot or benchmark claims, require:

- manifest snapshot and commit SHA evidence,
- deterministic seeds,
- split manifests with empty train/test profile and bundle intersections,
- summary artefacts under `docs/testing/benchmarks/results/YYYY-MM-DD/`.

Use `references/few-shot-evidence.md` before accepting results.

## 4) Validate artifact contracts

Require parity across:

- trained labels in model artifact,
- metadata label list,
- API-facing artifact contract values.

Reject changes that silently relax these checks.

## 5) Report with production-readiness context

In the final report, include:

- first command run,
- evidence file paths,
- whether smoke/full/integration confidence gates were executed,
- follow-up risks and mitigation.

## References

- Command ladder: `references/command-ladder.md`
- Few-shot evidence contract: `references/few-shot-evidence.md`
