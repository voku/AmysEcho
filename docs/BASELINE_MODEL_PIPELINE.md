# Baseline Model Generation Pipeline (Deterministic)

This document describes how to generate the global baseline MLP artifact in a
deterministic way so the checksum can be validated in CI and production.

## Goals
- Deterministic training outputs with a fixed random seed.
- Auditable provenance with dataset hashes and config snapshots.
- Training stats captured in `training_metadata.json` (including modality stats).

## Inputs
- `server/data/datasets/training_manifest.json` (bundle manifest)
- Optional legacy dataset `server/data/dgs_samples.json`
- MLP configuration values in `server/training/config_constants.py`

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

4. **Update checksum**
   ```bash
   python3 scripts/update_baseline_checksum.py
   ```

5. **Verify checksum**
   The CI test `server/test/baselineModelChecksum.test.ts` ensures the checksum
   matches the committed baseline artifact.

## Notes
- Keep `MLP_RANDOM_SEED` pinned for reproducible baselines.
- If you change feature sizes, update `spec/feature_schema.json` and re-run the
  checksum step.
