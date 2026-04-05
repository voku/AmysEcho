# Realistic DGS Training Cycle Validation (2026-04-05)

## Goal
Validate the current training path against real DGS landmark files committed in this repository (`server/data/dgs_video_examples/*_landmarks.json`).

## Command

```bash
python scripts/realistic_dgs_training_cycle.py \
  --attempts 1 \
  --max-files-per-label 4 \
  --holdout-ratio 0.25 \
  --usable-accuracy 0.5 \
  --timeout-seconds 180 \
  --seed 42 \
  --report-path /tmp/realistic_dgs_cycle_report.json
```

## Result
- Status: `ok`
- Attempts executed: `1`
- Best holdout top-1 accuracy: `0.5465`
- Best holdout macro-F1: `0.2023`
- Usable gate (`>= 0.5`): **pass**

## Notes
- Baseline comparison could not be evaluated because `server/data/models/global/amy_model.npz` is currently a Git LFS pointer file in this environment.
- To keep realistic cycle execution robust in such environments, `scripts/realistic_dgs_training_cycle.py` now records baseline load errors instead of aborting the run.
- Full machine-readable report was archived at `docs/testing/benchmarks/results/2026-04-05/realistic_dgs_cycle_report.json`.
