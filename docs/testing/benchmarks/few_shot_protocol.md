# Few-Shot Evaluation Protocol — Amy's Echo

**Created:** 2026-03-27
**Status:** Active protocol — follow for all model evaluation reports.

## 1) Purpose

Measure how well the Amy's Echo MLP generalises to new signs or new signers
when only a handful of training clips are available per label. Every result
published under `docs/testing/benchmarks/results/` **must** follow this
protocol so runs are reproducible and comparable.

---

## 2) Definitions

| Term | Meaning |
|------|---------|
| **Shot** | Number of training clips (bundles) per label. 1-shot = one clip per sign. |
| **Seed** | Integer controlling all randomised operations (`--seed` CLI or `MLP_RANDOM_SEED` env). |
| **Trial** | One full train→evaluate pass with a given (shot, seed) pair. |
| **Signer** | Identified by `profileId` in the training manifest; each profile corresponds to one person. |
| **Bundle** | One upload unit (`source_bundle_id`). All sliding-window samples from the same bundle share this ID. |
| **Leakage** | Samples from the same bundle (or signer) appearing in both train and validation/test sets. |

---

## 3) Dataset snapshot contract

Before running any evaluation:

1. **Freeze the manifest.** Copy the active `training_manifest.json` to
   `docs/testing/benchmarks/results/<YYYY-MM-DD>/manifest_snapshot.json`.
2. **Record the commit SHA** of the codebase used:
   ```bash
   git rev-parse HEAD > docs/testing/benchmarks/results/<YYYY-MM-DD>/commit.sha
   ```
3. **Record the Python environment:**
   ```bash
   pip freeze > docs/testing/benchmarks/results/<YYYY-MM-DD>/pip_freeze.txt
   ```
4. **Record key config constants** (copy from `server/training/config_constants.py`):
   - `WINDOW_SIZE` (default 30)
   - `WINDOW_STRIDE` (default 1)
   - `INPUT_FEATURE_SIZE` (default 1 629)
   - `VALIDATION_FRACTION` (default 0.15)
   - `EPOCHS`, `LEARNING_RATE`, `DROPOUT_RATE`
   - `EARLY_STOPPING_PATIENCE`

These snapshots ensure any future contributor can reproduce the exact run.

---

## 4) Leakage-safe split contract

### 4.1 Bundle-level grouping (already enforced)

`plan_grouped_train_validation_split` in `train_mlp.py` keeps all samples
from the same `source_bundle_id` in the same partition. This prevents
intra-bundle leakage (temporal windows from the same clip appearing in both
train and validation).

### 4.2 Signer-level holdout (required for few-shot reports)

For any result published as a few-shot benchmark:

- **Train set** and **validation/test set** must not share any `profileId`.
- A signer whose bundles appear in the training shot must have **zero**
  bundles in the validation or test partition.

#### How to enforce

The current `plan_grouped_train_validation_split` groups by
`source_bundle_id`. For signer-independent evaluation, callers must:

1. Partition the manifest entries by `profileId` **before** invoking
   training.
2. Designate held-out profiles as the test set; remaining profiles form
   the train pool.
3. From the train pool, select the target shot count per label (randomly
   with a fixed seed).
4. Run training **only** on the selected train bundles.
5. Evaluate on the held-out signer set.

This is orchestrated **outside** `train_mlp.py` by a runner script
(see §6 for the planned `train_mlp_fewshot.py` runner).

### 4.3 Split-manifest requirements

Every evaluation run must produce a `split_manifest.json`:

```json
{
  "protocol_version": 1,
  "date": "2026-04-XX",
  "commit_sha": "<40-char hex>",
  "seed": 42,
  "shot": 3,
  "train_profiles": ["profile-a", "profile-b"],
  "test_profiles": ["profile-c"],
  "train_bundles": ["bundle-id-1", "bundle-id-2", "..."],
  "test_bundles": ["bundle-id-7", "bundle-id-8"],
  "labels": ["hallo", "danke", "ja", "nein"],
  "train_samples_per_label": { "hallo": 12, "danke": 9, "..." : "..." },
  "test_samples_per_label": { "hallo": 4, "danke": 3, "..." : "..." }
}
```

**Validation rule:** The intersection of `train_bundles` and
`test_bundles` must be empty. The intersection of `train_profiles` and
`test_profiles` must be empty. A CI-level check should reject any manifest
that violates this.

---

## 5) Measurement protocol

### 5.1 Parameters

| Parameter | Values to sweep | Notes |
|-----------|----------------|-------|
| Shot count | 1, 3, 5, 10 | Per label in the train pool |
| Seed | 42, 1337, 2025 | Minimum 3 seeds per configuration |
| Feature mode | `absolute` (default) | Add `relative_delta` only if comparing |
| Epochs | 200 (default) | Use early stopping patience 10 |
| Dropout | 0.3 (default) | |

### 5.2 Metrics to report

For each (shot, seed) trial:

| Metric | Source | Required |
|--------|--------|----------|
| **Accuracy** (global) | `report.global.accuracy` | ✅ |
| **F1 score** (macro) | `report.global.f1_score` | ✅ |
| **Per-label accuracy** | `report.global.label_diagnostics` | ✅ |
| **Confusion matrix** | `report.global.confusion_matrix` | ✅ |
| **Sample count** | `report.global.samples` | ✅ |
| **Training wall time** | Timestamp delta | ✅ |

### 5.3 Aggregation

Across seeds for the same shot count, report:

- **Mean ± std** for accuracy and F1.
- **Worst-seed** accuracy (pessimistic bound).
- **Per-label mean accuracy** to identify hard signs.

### 5.4 Result artefacts

Store under `docs/testing/benchmarks/results/<YYYY-MM-DD>/`:

```
results/2026-04-XX/
├── commit.sha
├── pip_freeze.txt
├── manifest_snapshot.json
├── split_manifest_seed42_shot3.json
├── split_manifest_seed1337_shot3.json
├── ...
├── report_seed42_shot3.json        # raw train_mlp output
├── report_seed1337_shot3.json
├── ...
└── summary.md                      # aggregated table + analysis
```

---

## 6) Runner design (MAY-P0-1 delivered)

`server/src/amyserver_tools/train_mlp_fewshot.py` now provides the baseline orchestration path and automates:

1. Load manifest, group entries by `profileId`.
2. For each seed:
   a. Shuffle profiles deterministically.
   b. Hold out N profiles as test set.
   c. For each shot count:
      - Sample shot bundles per label from remaining profiles.
      - Write `split_manifest_seed{S}_shot{K}.json`.
      - Invoke `train_mlp.py --manifest <filtered> --seed {S}`.
      - Evaluate on held-out bundles.
      - Collect and write `report_seed{S}_shot{K}.json`.
3. Aggregate across seeds → `summary.json` + `summary.md`.

Runner CLI:

```
python train_mlp_fewshot.py \
  --manifest <path> \
  --data-dir <path> \
  --shots 1,3,5,10 \
  --seeds 42,1337,2025 \
  --test-profiles <comma-list or fraction> \
  --promote-best-model-dir <optional-model-dir> \
  --output-dir docs/testing/benchmarks/results/<date>/
```

Optional runtime integration (server-side default behavior):

- The server training workflow now routes through `train_mlp_fewshot.py` by default.
- The live server path uses `1,3,5` shots and automatically skips infeasible shot values when the current data volume is too small.
- To force the legacy path for experiments, set `MLP_SCRIPT` to `src/amyserver_tools/train_mlp.py`.
- Runner summaries now include `promotion` status and `diagnostics.fallback_metric_count` for observability.
- Reference execution artifact: `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_execution.md`.

---

## 7) Quality gates for published results

A few-shot result is **valid** only when:

- [ ] `commit.sha` matches a clean (no uncommitted changes) repository state.
- [ ] `manifest_snapshot.json` is committed alongside the results.
- [ ] Every `split_manifest_*.json` passes leakage check (§4.3).
- [ ] At least 3 seeds were used per shot count.
- [ ] `summary.md` includes mean ± std tables and identifies any label with
      accuracy below 50 % at the tested shot count.
- [ ] No manual data curation was applied between snapshot and training
      (prevent cherry-picking easy samples).

---

## 8) Known limitations

- **No explicit test set** in `train_mlp.py` today: the script uses only
  train/validation (85/15 default). The few-shot runner must create the
  held-out test partition externally.
- **Profile ≠ signer** if a caregiver records on behalf of multiple
  children under one profile. The protocol assumes one profile = one signer
  until device/signer metadata is expanded (MAY-P1-1 target).
- **NULL class** samples are generated from the beginning of each clip.
  These should be excluded from shot counting (they are background, not
  a sign).
