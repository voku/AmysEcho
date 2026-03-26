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
- Pad each hand vector to `21 * 3 = 63` values.
- Concatenate left then right => 126-length vector.

## Implementation

- Utility: `webapp/src/training/landmarkFeatureContract.ts`
- Fixture tests: `webapp/src/training/landmarkFeatureContract.test.ts`

## Notes

- This contract mirrors the same wrist-relative + max-abs normalization strategy used by the external kinivi reference pipeline.
- The goal is deterministic feature parity across future training/inference integration points.
