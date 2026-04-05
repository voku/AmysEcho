# SignLanguageRecognition Reuse Playbook (Merged for Amy's Echo)

## Purpose

This playbook captures the **useful concepts** we extracted from the legacy `Tachionstrahl/SignLanguageRecognition` project and maps them to Amy's Echo's maintained code paths.

The original upstream snapshot under `docs/training/external/signlanguage_recognition/` has been retired after consolidation to reduce documentation drift and remove dependence on an unmaintained code dump.

## Amy-first outcome

We keep only reuse patterns that improve Amy's communication reliability:

- deterministic preprocessing for unstable clip lengths,
- explicit and auditable inference configuration,
- conservative unknown-threshold behavior,
- artifact integrity checks to prevent model/label mismatch,
- evidence-based feature experiments (absolute vs. relative coordinates).

## Consolidated reusable patterns

## 1) Fixed-window normalization

**Upstream concept:** pad/truncate samples to a deterministic frame length.

**Amy implementation status:** implemented.

- `server/training/sliding_window.py` performs sequence normalization and window generation.
- `server/src/amyserver_tools/train_mlp.py` consumes normalized windows in the training pipeline.
- `server/src/constants/trainingQuality.ts` defines quality constraints used in preprocessing and promotion decisions.

## 2) Runtime inference contract instead of hidden constants

**Upstream concept:** runtime knobs should be explicit (window size, minimum frames, probability threshold, feature mode).

**Amy implementation status:** implemented and surfaced.

- `/latest-mlp-model` serves explicit model headers including schema and runtime configuration metadata.
- `webapp/src/gesture/modelClient.ts` validates response metadata and rejects incompatible profile artifacts for safe fallback.

## 3) Unknown-threshold confidence gating

**Upstream concept:** low-confidence predictions should resolve to unknown, not forced classes.

**Amy implementation status:** implemented with telemetry coverage.

- Runtime prediction rejection and threshold handling are enforced in detector logic.
- Telemetry events track low-confidence suppression to monitor false-positive risk in sparse-profile scenarios.

## 4) Model artifact discipline (weights + metadata contract)

**Upstream concept:** label ordering and output contract must be first-class artifacts.

**Amy implementation status:** implemented.

- Artifact contract metadata is validated during model serving.
- Invalid profile artifacts are rejected in client loading logic to prevent silent class-index drift.

## 5) Relative feature mode as experiment (not default)

**Upstream concept:** relative motion features can reduce signer bias but must be benchmarked.

**Amy implementation status:** implemented as opt-in experiment.

- `relative_delta` exists as an optional feature mode in server training.
- Benchmark evidence in `docs/testing/benchmarks/relative-vs-absolute-sparse-profile-report-2026-03-23.md` keeps `absolute` as default.

## Remaining follow-up opportunities

These are still valid if we want to extend the reuse work:

- Add an explicit artifact-side `label_map` file/hash verification step in server tests for mismatch scenarios.
- Expose active threshold/runtime config in a dedicated caregiver/developer diagnostics panel.
- Keep sparse-vocabulary regression fixtures updated for ambiguous signs.

## Decision log

- **2026-03-23:** external raw upstream snapshot removed after consolidation.
- **Reason:** the folder was useful for extraction, but long-term maintenance is clearer with one project-owned playbook and direct links to active Amy's Echo code/docs.
