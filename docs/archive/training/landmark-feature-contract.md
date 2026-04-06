# Landmark Feature Contract (Training + Inference)

This document defines the canonical hand-landmark feature normalization contract used for adaptation work.

## Contract

For each hand:

1. Take up to 21 landmarks (`x`, `y`, `z`).
2. Use landmark index `0` (wrist) as origin.
3. Convert all points to wrist-relative coordinates.
4. Flatten to 1D in landmark order (`x0,y0,z0,x1,y1,z1,...`).
5. Divide by max absolute value in the flattened vector (if max is not `0`).

For two-hand frames:

- Build one normalized vector per hand.
- Pad missing landmark coordinates with zeros so each hand vector has `21 * 3 = 63` values.
- Concatenate left then right => 126-length vector.

## Implementation

- Shared spec: `spec/feature_schema.json` (`handFeatureContract`)
- Utility: `webapp/src/training/landmarkFeatureContract.ts`
- Upload validation: `server/src/routes/trainingBundleRoute.ts`
- Trainer enforcement: `server/src/amyserver_tools/train_mlp.py`
- Fixture tests: `webapp/src/training/landmarkFeatureContract.test.ts`

## Enforcement

- Training bundle uploads must include the exact `featureContract` metadata written by the webapp.
- The server persists that contract into the training manifest without rewriting it.
- The Python trainer rejects manifest entries whose contract is missing or mismatched.
- Trained artifacts record the contract again in `training_metadata.json` so runtime model validation can diagnose drift quickly.
- Trained `.npz` artifacts also carry per-label `counts.npy` support counts.
- Runtime MLP selection uses those support counts to apply stricter acceptance thresholds and candidate margins for sparse labels instead of treating every label as equally trustworthy.

## Notes

- This contract mirrors the same wrist-relative + max-abs normalization strategy used by the external kinivi reference pipeline.
- Training reports and `training_metadata.json` now also include `dataset_health` summaries (class spread, low-support labels, missing validation coverage, top confusion hotspots) so dataset hygiene problems are visible before a weak model reaches Amy.
- The goal is deterministic feature parity across future training/inference integration points.
