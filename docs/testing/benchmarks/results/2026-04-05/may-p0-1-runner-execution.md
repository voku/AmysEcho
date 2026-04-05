# MAY-P0-1 — few-shot runner execution evidence (2026-04-05)

## Scope
- Validate that `train_mlp_fewshot.py` is operational as a repeatable default runner with deterministic seed/shot controls.
- Validate artifact contract (`split_manifest`, per-trial `report`, `summary.json`, and human-readable `summary.md`).

## First command
```bash
python3 server/src/amyserver_tools/train_mlp_fewshot.py \
  --manifest docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/fixture_data/datasets/training_manifest.json \
  --data-dir docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/fixture_data \
  --output-dir docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts \
  --shots 1 \
  --seeds 42 \
  --test-profile-fraction 0.5 \
  --skip-examples
```

## Result snapshot
- Exit status: success (`0`).
- Deterministic trial matrix executed: `shots=[1]`, `seeds=[42]`.
- Held-out signer diagnostics present (`evaluated_test_samples=20`, `dropped_unknown_label_samples=0`).
- Fallback metric diagnostics present (`fallback_metric_count=0`).
- Best-trial metrics written to `summary.json` and mirrored in `summary.md`.

## Produced artifacts
- `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/split_manifest_seed42_shot1.json`
- `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/train_manifest_seed42_shot1.json`
- `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/report_seed42_shot1.json`
- `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/summary.json`
- `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/summary.md`

## Notes
- This run uses a committed synthetic fixture dataset to ensure deterministic, reproducible CI-safe execution without requiring live caregiver uploads.
- Production runs can replace the fixture manifest with the current training snapshot while preserving the same runner/artifact contract.
