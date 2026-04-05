# Non-Manual Marker Dataset Plan

This document describes the dataset requirements for non-manual markers (face + pose cues) in DGS recognition.

## Requirements

- Gloss labels must include non-manual markers when relevant (e.g., facial expression, head tilt).
- Each sample includes aligned timestamps for landmarks and gloss tokens.
- Dataset split: 70% train / 15% validation / 15% test, stratified by gloss and non-manual marker.

## Candidate Sources

- Existing caregiver recordings with consent (internal)
- Public DGS corpora with facial markers (if licensing allows)

## Label Format

- `GLOSS` for manual sign
- `GLOSS+NMM` for non-manual markers (e.g., `JA+HEAD_NOD`)

## Next Steps

- Confirm licensing constraints
- Define annotation guide and tooling
- Produce a small pilot set for benchmarking
