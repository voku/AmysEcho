# DGS Reuse Plan: Extracted from SignLanguageRecognition

This document tracks how reusable ideas from `Tachionstrahl/SignLanguageRecognition` are integrated into Amy's Echo.

## Why this matters for Amy

The upstream project validated a practical sequence for sign recognition:

1. Landmark extraction from video streams
2. Deterministic sequence normalization
3. Temporal model training
4. Live recognition with confidence gating

For Amy's Echo, we reuse these **patterns** while keeping profile-aware architecture, quality checks, and German UX guidance.

---

## Consolidated reference

The extracted reuse knowledge is now maintained in:

- `docs/training/signlang-reuse-playbook.md`

This replaces the previous raw upstream snapshot directory and keeps the project focused on maintainable, Amy-specific implementation guidance.

---

## Reusable patterns to adapt

## 1) Fixed-window training data normalization

**Upstream insight:** sequences are padded/truncated to a constant frame count with zero defaults.

**Amy adaptation target:**
- Keep the concept, but drive by config per model profile.
- Preserve modality-presence metadata (hands/pose/face coverage) during padding.

**Implementation tasks:**
- [x] Add a normalization utility in `server/training/` that mirrors fixed-window behavior with explicit schema-aligned output.
- [x] Add tests for short clips, long clips, and empty/missing-modality frames in `server/test/`.

## 2) Runtime inference options contract

**Upstream insight:** inference behavior should be explicit and auditable.

**Amy adaptation target:**
- Keep live recognition thresholds explicit in TS/Python config (no hidden constants).
- Keep profile-specific overrides possible.

**Implementation tasks:**
- [x] Expose active model/runtime metadata in `/latest-mlp-model` headers.
- [x] Consume and validate contract metadata in webapp model loading.
- [x] Add threshold behavior test assertions for low-confidence predictions.

## 3) Relative-motion feature mode as optional fallback

**Upstream insight:** relative delta mode can reduce signer-specific coordinate drift.

**Amy adaptation target:**
- Keep as optional experiment, keep absolute baseline as default.
- Ensure deterministic first-frame behavior and benchmarking.

**Implementation tasks:**
- [x] Add `relative_delta` feature generation option in `server/training/sliding_window.py`.
- [x] Track feature mode in training report and model headers.
- [x] Add an A/B benchmark doc under `docs/testing/benchmarks/`.

## 4) Confidence gating and `<unknown>` handling

**Upstream insight:** predictions below threshold should map to unknown instead of forced class.

**Amy adaptation target:**
- Keep conservative unknown behavior to avoid confusing communication.
- Tie unknown-rate monitoring to telemetry.

**Implementation tasks:**
- [x] Add explicit unknown-threshold contract in inference handling.
- [x] Add telemetry assertions for prediction rejection payloads.
- [ ] Add additional sparse-label false-positive suppression regression cases as new fixtures are added.

## 5) Label-map as first-class artifact

**Upstream insight:** model output index order should be guarded as an explicit artifact contract.

**Amy adaptation target:**
- Bundle `labelMap + featureSchema + thresholds` with each model version.
- Reject model load when artifact pieces are inconsistent.

**Implementation tasks:**
- [x] Extend model manifest/metadata validation in model-serving path.
- [x] Reject invalid profile artifacts in webapp model loader and fallback safely.
- [x] Persist label lists in `training_metadata.json` and reject `label_count` mismatches in `/latest-mlp-model` contract validation.
- [x] Expand server tests with explicit label-count/label-list mismatch fixtures.

---

## Definition of done

- [x] Training and inference use explicit shared config contracts.
- [x] Model artifacts are self-describing and validated before use.
- [x] Unknown prediction handling is tested and visible in telemetry.
- [x] Benchmarks document whether relative features help sparse child-profile data.
- [x] Legacy extraction dump is consolidated into maintainable project documentation.
