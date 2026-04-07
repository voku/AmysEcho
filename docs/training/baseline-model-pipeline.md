# Baseline Model Generation Pipeline (Deterministic)

This document describes how to generate the global demo MLP artifact in a
deterministic way so the checksum can be validated in CI and production. Runtime
profile training must not overwrite this bundle.

## Goals
- Deterministic training outputs with a fixed random seed.
- Auditable provenance with dataset hashes and config snapshots.
- Training stats captured in `training_metadata.json` (including modality stats).
- A complete committed bundle under `server/data/models/global/`:
  `amy_model.npz`, `amy_model.npz.sha256`, and `training_metadata.json`.

## Inputs
- `server/data/datasets/training_manifest.json` (bundle manifest)
- MLP configuration values in `server/src/amyserver_tools/config_constants.py`

## Deterministic Training Steps
1. **Pick a fixed seed**
   ```bash
   export MLP_RANDOM_SEED=4242
   ```

2. **Run the trainer**
   ```bash
   python3 server/src/amyserver_tools/train_mlp.py \
     --manifest server/data/datasets/training_manifest.json \
     --data-dir server/data \
     --seed 4242
   ```

3. **Validate output metadata**
   - `server/data/models/global/training_metadata.json` now contains:
     - `training_sources` → SHA256 hashes of the input datasets
     - `config_snapshot` → training config + feature schema sizes
     - `stats` → build/sample statistics (including modality counts)
     - `augmentation_provenance` → temporal augmentation audit trail (frame-drop, speed perturbation, time-warp, jitter, mirror usage) and episodic sampling details when enabled
     - `prototype_bank` → sparse-label support summary (number of stored few-shot prototypes and covered labels)

4. **Write checksum**
   `train_mlp.py` writes `server/data/models/global/amy_model.npz.sha256` alongside
   the output model. Use `scripts/update_baseline_checksum.py` only when you need
   to validate and refresh an existing demo bundle without running the trainer.

5. **Verify checksum**
   The CI test `server/test/baselineModelChecksum.test.ts` ensures the checksum
   matches the committed baseline artifact.

## Notes
- Keep `MLP_RANDOM_SEED` pinned for reproducible baselines.
- Use `--skip-global-output` for runtime/user training jobs that should produce
  only profile-specific models.
- If you change feature sizes, update `spec/feature_schema.json` and re-run the
  checksum step.
- Episodic sampling can be enabled through `TrainingConfig` (`sampling_mode="episodic"`) for N-way/K-shot training on sparse labels.
- Validation is now planned bundle-aware instead of shuffling overlapping windows from the same clip across train/validation.
  If you inspect training output, look for `label_diagnostics` to confirm each label still has distinct train/validation groups.
- `label_diagnostics.top_confusions` are now derived from the validation split when validation groups exist.
  If a sparse label still shows `validation_group_count = 0`, treat the report as "bootstrap only, not yet independently checked" rather than as evidence that the gesture is already stable.
- Trained `.npz` bundles can now include `prototype_vectors`, `prototype_labels`, and `prototype_support`.
  The webapp uses them as a few-shot similarity head next to the dense MLP so new/custom gestures can work with fewer caregiver recordings.
- Training reports now include per-label diagnostics (`bundle_count`, `rejected_bundle_count`, `window_count`, `prototype_count`, and `top_confusions`) so sparse-label failures like `satt` vs `trinken` can be debugged from real report data instead of only aggregate accuracy.
- Mirror augmentation is only applied for labels marked `metadata.augmentation.mirrorSafe = true` in the bundle manifest.
