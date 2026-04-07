# DGS Realistic Test and Training Protocol

This document turns the DGS planning note into a concrete protocol for
benchmarking and data preparation. The goal is not to invent a second training
product track, but to make the current pipeline honest about what it can and
cannot measure.

## What "realistic" means here

- Use the same task definition end-to-end.
- Keep signer/session/bundle leakage out of train, validation, and test splits.
- Separate clean internal baselines from real-world test material.
- Treat licensing and privacy as part of the dataset design, not as an afterthought.

## Current repo alignment

The existing codebase already provides the right building blocks for a realistic
DGS protocol:

- `docs/training/baseline-model-pipeline.md` documents deterministic baseline
  training, dataset hashes, and config snapshots.
- `docs/training/per-user-label-training.md` describes profile-scoped label
  training and the current bootstrap/stability split.
- `docs/testing/benchmarks/few-shot-protocol.md` already defines a
  leakage-safe reproducibility contract.
- `server/src/amyserver_tools/train_mlp.py` and the related tests already
  track bundle grouping, label diagnostics, and signer-leakage guards.

That means the DGS protocol should extend the current baseline, not replace it.

## Task definitions

Keep the benchmarks separate:

- **Isolated classification**: one label per fixed window or clip.
- **Continuous sign language recognition**: ordered gloss sequence output.
- **Translation**: sign video to German text.

Do not mix those outputs in one metric table. A model can be useful for one task
and wrong for another.

The first successful upload for a sign is a bootstrap event, not a stability
claim. Treat it as a usable start state; only independent validation bundles
should support "stable" language.

## Data source tiers

### Tier 1: Caregiver-controlled recordings

This is the safest source for training and validation because the signing style
matches the child or caregiver directly. Use it for the main supported product
surface.

### Tier 2: Curated DGS resources

Use only when the sign system is known to match the learner's source. The
archived consistency note explains why mixed sources cause false negatives.

Recommended references:

- `docs/archive/training/video-source-consistency.md`
- `docs/archive/training/dgs-cc-resources.md`

### Tier 3: Public corpora for research baselines

Public corpora such as MEINE DGS, PHOENIX, and SIGNUM are useful for baseline
comparisons and robustness checks, but they should not be treated as automatic
training truth for the supported app surface.

### Tier 4: Official broadcast videos

Use these only as a carefully permissioned real-world test set. They are useful
for robustness, but they are not a safe default training source.

## Split rules

- Split by signer first.
- Keep all windows from the same clip together.
- Keep session or device context separate when the data supports it.
- Never report a test result that reuses a training clip, even indirectly.

## Preprocessing contract

- Extract the same landmark representation that the webapp uses at runtime.
- Preserve modality-presence metadata when a modality is missing.
- Track capture context such as FPS, resolution, and device class.
- Reject low-quality bundles instead of silently normalizing away the problem.

## Evaluation matrix

| Task | Primary metric | Secondary checks |
|---|---|---|
| Isolated classification | Accuracy, macro-F1 | Confusion matrix, calibration |
| Continuous recognition | WER / token error rate | Boundary F1, per-signer breakdown |
| Translation | BLEU / chrF | Oracle comparison, error typing |

## Reproducibility requirements

- Pin dataset snapshots and manifest hashes.
- Record seeds, commit SHA, and environment versions.
- Publish the exact split manifest used for each run.
- Log label-level diagnostics so sparse-label failures are visible.

## Practical next steps

1. Publish the final task definition for the DGS baseline.
2. Freeze one signer-safe benchmark snapshot.
3. Run the current landmark baseline on that snapshot.
4. Add a second evaluation set for real-world broadcast material.
5. Keep the legal/privacy review attached to the dataset manifest.

## Fixture Snapshot Log

- 2026-04-07: `docs/testing/benchmarks/rd-p1-4-realistic-dgs-cycle-2026-04-07.md` records a repository-fixture cycle against `server/data/dgs_video_examples`. It validates the current training workflow and split mechanics, but the best attempt did not meet the usable threshold and the fixture set does not provide signer-independent production evidence.
