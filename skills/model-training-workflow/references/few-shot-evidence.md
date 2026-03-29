# Few-Shot Evidence Contract

For benchmark-style claims, require these artefacts:

1. `manifest_snapshot.json`
2. `commit.sha`
3. `pip_freeze.txt`
4. `split_manifest_seed*_shot*.json`
5. `report_seed*_shot*.json`
6. `summary.md`

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
