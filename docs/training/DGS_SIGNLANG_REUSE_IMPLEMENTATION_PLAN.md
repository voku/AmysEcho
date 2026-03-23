# DGS Reuse Plan: Extracted from SignLanguageRecognition

This document turns reusable ideas from `Tachionstrahl/SignLanguageRecognition` into concrete Amy's Echo implementation tasks.

## Why this matters for Amy

The upstream project already validated a practical sequence for sign recognition:

1. Landmark extraction from video streams
2. Deterministic sequence normalization
3. Temporal model training
4. Live recognition with confidence gating

For Amy's Echo, we can reuse these **patterns** while keeping our profile-aware architecture, quality checks, and German UX guidance.

---

## Extracted assets copied into this repository

Reference copies are stored under:

- `docs/training/external/signlanguage_recognition/data_repository.py`
- `docs/training/external/signlanguage_recognition/sign_lang_prediction_calculator.proto`
- `docs/training/external/signlanguage_recognition/README.md`
- `docs/training/external/signlanguage_recognition/SOURCE_FILE_INDEX.md`
- `docs/training/external/signlanguage_recognition/HANDOFF_IMPLEMENTATION_MAP.md`

These are intentionally isolated from runtime code and serve as migration references.

---

## Reusable patterns to adapt

## 1) Fixed-window training data normalization

**Upstream insight:** all sequences are padded/truncated to constant frame count (`100`) with zero defaults.

**Amy adaptation target:**
- Keep the concept, but drive by config per model profile.
- Preserve modality-presence metadata (hands/pose/face coverage) during padding.

**Implementation tasks:**
- [ ] Add `windowFrames` and `padValue` as explicit training config in `server/src/constants/trainingQuality.ts` and propagate into trainer invocation.
- [ ] Add a normalization utility in `server/training/` that mirrors fixed-window behavior with explicit schema version output.
- [ ] Add tests for short clips, long clips, and empty/missing-modality frames in `server/test/`.

## 2) Runtime inference options contract

**Upstream insight:** inference behavior is configurable via proto options (`framesWindowSize`, `minFramesForInference`, `thresholdFramesCount`, `probabilityThreshold`, `useRelative`).

**Amy adaptation target:**
- Make live recognition thresholds explicit and auditable in TypeScript/Python config (no hidden constants).
- Keep profile-specific overrides possible.

**Implementation tasks:**
- [ ] Define a shared runtime recognition config schema in `server/src/types/` and expose active values in model metadata returned to webapp.
- [ ] Surface these values in webapp diagnostics (`webapp/src/components/TrainingUpload.tsx` or model status view) for caregiver transparency.
- [ ] Add integration tests that verify threshold behavior against low-confidence predictions.

## 3) Relative-motion feature mode as optional fallback

**Upstream insight:** a relative delta mode (`useRelative`) can reduce signer-specific absolute coordinate drift.

**Amy adaptation target:**
- Add optional derived delta features for experimentation, but keep absolute baseline as default.
- Ensure first-frame initialization behavior is deterministic and tested.

**Implementation tasks:**
- [x] Add `relative_delta` feature generation option in `server/training/sliding_window.py`.
- [x] Track feature mode in training report and model headers.
- [x] Add an A/B benchmark doc under `docs/testing/benchmarks/` (absolute vs relative on sparse profile data). _See `docs/testing/benchmarks/relative_vs_absolute_sparse_profile_report_2026-03-23.md`._

## 4) Confidence gating and `<unknown>` handling

**Upstream insight:** predictions below threshold should map to unknown instead of forced class.

**Amy adaptation target:**
- Keep conservative unknown behavior to avoid confusing Amy with wrong confident words.
- Tie unknown-rate monitoring to telemetry.

**Implementation tasks:**
- [ ] Add explicit unknown-threshold contract in inference path and response schema.
- [ ] Ensure UI wording remains non-judgmental and in German for child-facing states.
- [ ] Add regression tests for false-positive suppression in sparse-label scenarios.

## 5) Label-map as first-class artifact

**Upstream insight:** model output index order is kept stable via dedicated label map files.

**Amy adaptation target:**
- Bundle `labelMap + featureSchema + thresholds` with each model version.
- Reject model load when artifact pieces are inconsistent.

**Implementation tasks:**
- [ ] Extend model manifest format in `server/data/models/*` metadata.
- [ ] Validate artifact integrity on `/latest-mlp-model` response path.
- [ ] Add tests for mismatched class-count/label-map failures.

---

## Do-not-copy list (important)

Do not import upstream behavior that conflicts with Amy's Echo standards:

- Hardcoded filesystem paths (`/home/...`)
- Legacy dependency pinning assumptions (Ubuntu 18.04 + old MediaPipe/Bazel)
- Graph contracts with missing side packets/tags
- Untracked magic numbers for tensor shapes

---

## Implementation order (recommended)

1. Artifact contract (`labelMap + schema + thresholds`) and model metadata validation
2. Fixed-window normalization utility + tests
3. Unknown-threshold inference gating + UI/telemetry wiring
4. Optional relative-motion feature mode + benchmark

---

## Definition of done

- [ ] Training and inference use explicit shared config contracts.
- [ ] Model artifacts are self-describing and validated before use.
- [ ] Unknown prediction handling is tested and visible in telemetry.
- [x] Benchmarks document whether relative features help sparse child-profile data.
