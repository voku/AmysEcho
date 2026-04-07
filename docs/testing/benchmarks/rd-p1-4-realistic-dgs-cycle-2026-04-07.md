# RD-P1-4 Realistic DGS Cycle Snapshot (2026-04-07)

## Summary

Decision: **keep the realistic DGS protocol active, but do not treat the current repository fixture run as production-ready training evidence**.

The current landmark fixture cycle is reproducible and exercises the real training path, but it did not meet the configured usable accuracy threshold. This is an honest benchmark snapshot, not a model-promotion result.

## Command

```bash
python3 scripts/realistic_dgs_training_cycle.py \
  --workflow-preset chat-validated-2026-03 \
  --timeout-seconds 600 \
  --report-path /tmp/rd-p1-4-realistic-dgs-cycle-report.json
```

The temporary JSON report was generated under `/tmp` and was not committed because it contains transient model paths from `server/data/datasets/realistic_dgs_cycle_*`. This committed summary captures the reproducible metrics and gate result.

## Dataset Snapshot

| Field | Value |
|---|---:|
| Source directory | `server/data/dgs_video_examples` |
| Landmark files discovered | 117 |
| Train files | 26 |
| Evaluation files | 13 |
| Labels | 13 |
| Holdout sample count | 272 |
| Known-label holdout samples | 272 |
| Unknown-label holdout samples | 0 |
| Workflow preset | `chat-validated-2026-03` |
| Epoch schedule | `20,40,80` |
| Usable accuracy threshold | 0.35 |

## Attempt Results

| Attempt | Epochs | Top-1 accuracy | Macro-F1 | Usable threshold met |
|---:|---:|---:|---:|---|
| 1 | 20 | 0.3161764706 | 0.1430683307 | No |
| 2 | 40 | 0.0919117647 | 0.0789350615 | No |
| 3 | 80 | 0.0882352941 | 0.0506767782 | No |

Best attempt: **1** (`epochs=20`).

Gate result: **not usable** (`0.3161764706 < 0.35`).

## Data-Tier Note

- Tier 1 caregiver-controlled recordings: not present in this snapshot.
- Tier 2 curated DGS resources: repository landmark examples are useful for fixture-level pipeline checks, but they should not be promoted as Amy-specific training truth.
- Tier 3 public/research corpora: acceptable for research baselines only when licensing and signer metadata are explicit.
- Tier 4 broadcast videos: test-only unless a separate legal/privacy review clears the material.

This snapshot is fixture-level evidence for the training workflow and split mechanics. It is not signer-independent proof because the repository examples do not include enough signer/session metadata to validate signer holdout in the same way the real protocol requires.

## Workflow Fixes Validated

- `scripts/realistic_dgs_training_cycle.py` now adds the canonical `featureContract` metadata to generated manifest entries, matching the current trainer gate in `train_mlp.py`.
- The same script now imports `amyserver_tools.train_mlp` as a package module for evaluation, preserving the trainer's package-relative imports.

## Verification

- `python3 -m pytest -q server/test/test_realistic_dgs_training_cycle.py` passed.
- The realistic cycle command above passed and produced `status: ok`.
