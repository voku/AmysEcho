# DGS Training: First Usable Model Produced (2026-04-24)

## Summary

Decision: **model promoted — usable accuracy threshold met in one attempt**.

This is the first time the realistic DGS training cycle has reached the configured usable accuracy threshold using only the repository landmark fixtures. The promoted model now lives at `server/data/models/global/amy_model.npz`.

## Command

```bash
python3 scripts/realistic_dgs_training_cycle.py \
  --attempts 5 \
  --epoch-schedule 200 \
  --max-files-per-label 10 \
  --holdout-ratio 0.2 \
  --usable-accuracy 0.35 \
  --keep-attempt-artifacts \
  --auto-promote-on-usable \
  --report-path /tmp/training_report_run2.json
```

## Dataset Snapshot

| Field | Value |
|---|---:|
| Source directory | `server/data/dgs_video_examples` |
| Landmark files discovered | 117 |
| Train files | 72 |
| Evaluation files | 19 |
| Labels | 13 DGS gestures + `_NULL_` = 14 total |
| Holdout sample count | 451 |
| Known-label holdout samples | 451 |
| Unknown-label holdout samples | 0 |
| Max files per label | 10 |
| Holdout ratio | 0.20 |
| Epoch schedule | `200` |
| Usable accuracy threshold | 0.35 |

## Labels Trained

`_NULL_`, `alle`, `blau`, `essen`, `fertig`, `gelb`, `gruen`, `kindergarten`, `nochmal`, `rot`, `satt`, `schwester`, `spielen`, `trinken`

## Attempt Results

| Attempt | Epochs | Top-1 accuracy | Macro-F1 | Usable threshold met |
|---:|---:|---:|---:|---|
| 1 | 200 | **0.6585** | **0.3880** | **Yes — stopped early** |

Best attempt: **1** (`epochs=200`). Training completed in ~10 minutes.

Gate result: **usable** (`0.6585 > 0.35`). Model promoted automatically.

## Model Architecture

| Parameter | Value |
|---|---:|
| Window size | 30 frames |
| Feature size per frame | 1629 |
| Input dimension | 48870 |
| Layer 1 (hidden) | 512 units |
| Layer 2 (hidden) | 256 units |
| Output | 14 labels |

## Label Coverage in Evaluation Set

| Label | Eval samples |
|---|---:|
| `_NULL_` | 76 |
| `alle` | 45 |
| `blau` | 1 |
| `essen` | 2 |
| `fertig` | 94 |
| `gelb` | 8 |
| `gruen` | 1 |
| `kindergarten` | 1 |
| `nochmal` | 6 |
| `rot` | 9 |
| `satt` | 45 |
| `schwester` | 1 |
| `spielen` | 93 |
| `trinken` | 69 |

Note: some low-coverage labels (`blau`, `gruen`, `kindergarten`, `schwester`) had only one or two eval files. Their per-label accuracy is less reliable. The global accuracy of 65.9% is the primary quality gate metric.

## Why the Previous Run Failed

The previous `chat-validated-2026-03` preset used only 3 files per label with epochs `[20, 40, 80]`, giving:
- 26 training files → ~2 per label
- Best accuracy: 31.6% (just below the 35% threshold)

Increasing to `max-files-per-label=10` (74 training files, 5–8 per label) and `epochs=200` crossed the threshold comfortably.

## Post-Promotion State

- Model file: `server/data/models/global/amy_model.npz`
- Metadata: `server/data/models/global/training_metadata.json` (14 labels, promoted from training run)
- Checksum file: `server/data/models/global/amy_model.npz.sha256` updated
- All 299 JS + 162 Python server tests pass with the new model
- All 1291 webapp tests pass

## Fixes Applied During This Session

1. **`scripts/training_workflow_smoke.py`** — Fixed broken sweep invocation:
   - Changed `--manifest` → `--train-manifest` + `--heldout-manifest` (matching current sweep CLI)
   - Added `--skip-signer-split-validation` for reference data (DGS examples have no profile IDs)

2. **`scripts/realistic_dgs_training_cycle.py`** — Fixed promotion:
   - Now copies `training_metadata.json` alongside the model when promoting

3. **`webapp/package.json`** — Fixed ESLint 10 peer dep conflict:
   - Upgraded `eslint-plugin-react-hooks` from `^7.0.1` to `^7.1.1` (adds ESLint 10 support)

## Data-Tier Note

- Tier 1 caregiver recordings: not present. Accuracy on real Amy data may differ.
- These results use Tier 2 curated DGS resources from `server/data/dgs_video_examples`.
- The 65.9% accuracy is sufficient to establish a working detection baseline for the supported DGS gesture set.
- Tier 1 personal recordings from Amy or her caregiver will further improve accuracy for the specific signer.
