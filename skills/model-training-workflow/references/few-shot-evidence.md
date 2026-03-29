# Few-Shot Evidence Contract

For benchmark-style claims, the following evidence set is required.

## A) Per-trial writer outputs (produced by few-shot workflow)

1. `split_manifest_seed*_shot*.json`
2. `report_seed*_shot*.json`

## B) Release-bundle required artefacts (produced by release commands)

3. `manifest_snapshot.json`
4. `commit.sha`
5. `pip_freeze.txt`
6. `summary.md`

Producer commands for release-bundle artefacts:

- `cp <active-training-manifest> docs/testing/benchmarks/results/YYYY-MM-DD/manifest_snapshot.json`
- `git rev-parse HEAD > docs/testing/benchmarks/results/YYYY-MM-DD/commit.sha`
- `PY_BIN=$(node ./server/scripts/resolve-python-bin.mjs) && "$PY_BIN" -m pip freeze > docs/testing/benchmarks/results/YYYY-MM-DD/pip_freeze.txt`
- `python3 server/src/amyserver_tools/train_mlp_fewshot.py ... --output-dir docs/testing/benchmarks/results/YYYY-MM-DD/` then aggregate trial reports into `summary.md`

Validation rules:

- `train_profiles ∩ test_profiles = ∅`
- `train_bundles ∩ test_bundles = ∅`
- at least 3 seeds per shot value for published comparisons

Minimum metadata to include in summaries:

- shot values
- seed list
- mean ± std for accuracy and F1
- worst-seed accuracy
- labels under 50% accuracy
