# Training Helper Workflows (DGS)

This document describes the helper scripts that were added to make DGS training validation reproducible for contributors and CI-like local checks.

All commands below are run from repository root.

---

## 1) Smoke workflow (recommended first check)

### Command

```bash
npm run train:workflow:smoke --prefix server
```

### What it does

Runs `scripts/training_workflow_smoke.py`, which orchestrates:

1. a lightweight realistic DGS training cycle on repository landmark videos,
2. generated model artifact checks (`.npz` keys + metadata existence),
3. strict label parity check (NPZ `labels` must exactly match `training_metadata.json` labels),
4. artifact contract consistency check (`labels.length === artifact_contract.label_count`),
5. a sweep run on the generated train manifest.

### Success criteria

- command exits with status `0`,
- output JSON contains `"status": "ok"`,
- output includes `modelPath`, `trainManifestPath`, and `sweepBest`.

---

## 2) Hyperparameter sweep helper

### Command

```bash
npm run train:mlp:sweep --prefix server -- \
  --manifest <path-to-train-manifest.json> \
  --data-dir <path-to-server-data-dir> \
  --epochs 5,20 \
  --learning-rates 0.001,0.003 \
  --dropouts 0.2,0.3 \
  --early-stopping 5,10 \
  --trials 2 \
  --skip-examples
```

### What it does

Runs `server/src/amyserver_tools/train_mlp_sweep.py` and prints ranked JSON:

- `best`: top config by `(mean_f1_score, mean_accuracy)`,
- `results`: all tested configs and per-trial metrics.

The sweep is strict: it fails if the training report does not contain valid numeric `accuracy` and `f1_score`.
It also fails fast when `--trials < 1` (`--trials must be >= 1`).

---

## 3) Realistic cycle (fuller run)

### Command

```bash
npm run train:mlp:realistic --prefix server
```

### Notes

- This uses `scripts/realistic_dgs_training_cycle.py` with the workflow preset currently wired in `server/package.json`.
- It is heavier than smoke and intended for deeper validation or readiness checks.

---

## 4) Fast validation command set for PRs touching training artifacts

Run these in order:

```bash
PYTHONPATH=./server/src:./server python -m pytest -q server/test/test_train_mlp_sweep.py
npm run test:ts --prefix server -- latestMlpModelRoute.test.ts
npm run train:workflow:smoke --prefix server
```

If all three pass, helper workflows + label-contract checks are operational.

---

## 5) Full integration confidence gate before tag

For release readiness (beyond trainer-only checks), run:

```bash
cd integration && node test-runner.js ci
```

Notes:
- The integration runner timeout is configurable via `INTEGRATION_GLOBAL_TIMEOUT_MS`.
- Default timeout is CI-aware (30 minutes when `CI=true`, 15 minutes locally).
