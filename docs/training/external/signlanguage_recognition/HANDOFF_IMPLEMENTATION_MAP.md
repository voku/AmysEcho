# Handoff Implementation Map: Reusing SignLanguageRecognition for Amy's Echo

This file is for the next LLM/contributor who may not have access to the upstream code.
It maps reusable upstream concepts into Amy's Echo implementation tasks with target files and acceptance criteria.

## 0) Upstream snapshot

- Repo: `Tachionstrahl/SignLanguageRecognition`
- Last commit: `d6358d5994163b48cbd2857300c826e082d03aa3`
- Last update: 2022-10-09
- Stack: MediaPipe graphs + C++ calculators + Python LSTM training scripts + TFLite runtime

---

## 1) What is worth reusing (concept extraction)

## A. Fixed-window sequence normalization

**Source concept**
- `lab/data_repository.py` normalizes each sample to 100 frames and zero-fills missing rows.

**Why it helps Amy**
- Deterministic tensor shapes for training/inference.
- Easier debugging when uploads vary in length.

**Amy target implementation**
- Use in server trainer path as explicit, versioned preprocessing step.

**Target files**
- `server/training/sliding_window.py`
- `server/src/amyserver_tools/train_mlp.py`
- `server/src/constants/trainingQuality.ts`

---

## B. Explicit runtime inference knobs

**Source concept**
- `sign_lang_prediction_calculator.proto` defines controls like:
  - frame window size
  - min frames for inference
  - confidence threshold
  - relative feature mode

**Why it helps Amy**
- Prevents hidden magic constants.
- Enables profile-aware tuning (child-specific quality/latency tradeoff).

**Amy target implementation**
- Add explicit runtime config contract in server model metadata and webapp diagnostics.

**Target files**
- `server/src/server.ts` (model response metadata)
- `server/src/types/*` (recognition config schema)
- `webapp/src/gesture/modelClient.ts`
- `webapp/src/components/TrainingUpload.tsx`

---

## C. Confidence gating with explicit unknown behavior

**Source concept**
- Upstream inference emits unknown when confidence below threshold.

**Why it helps Amy**
- Reduces incorrect confident guesses that confuse communication.

**Amy target implementation**
- Use a thresholded unknown policy and expose unknown-rate telemetry.

**Target files**
- `webapp/src/gesture/*` (runtime prediction handling)
- `webapp/src/telemetry/*`
- `integration/test/*` for sparse-data false-positive cases

---

## D. Label map as first-class deployment artifact

**Source concept**
- Separate label map file (`sign_lang_label_map.txt`) tied to model output index order.

**Why it helps Amy**
- Prevents class index drift across retraining/deployments.

**Amy target implementation**
- Enforce artifact triplet: `model weights + label map + feature schema (+ thresholds)`.

**Target files**
- `server/data/models/*`
- `server/src/server.ts` (validation + response)
- `server/test/*` (artifact mismatch tests)

---

## E. Optional relative-motion features for personalization experiments

**Source concept**
- Relative delta mode exists (`useRelative`) to reduce signer bias.

**Why it helps Amy**
- Might improve sparse profile personalization where absolute positions vary.

**Amy target implementation**
- Keep as optional experiment mode with benchmark evidence, not default.

**Target files**
- `server/training/sliding_window.py`
- `docs/testing/benchmarks/*`

---

## 2) What must NOT be copied directly

1. Absolute filesystem paths (`/home/signlang`, `/home/michi`).
2. Upstream graph/tag inconsistencies.
3. Old dependency pin assumptions.
4. Hardcoded tensor dimensions without schema validation.

---

## 3) Known upstream issues already identified (for context only)

- Pose graph points to missing model filename: `sign_lang_recognition_pose2.tflite`.
- CPU video-processing graph likely missing required `CSV_OUTPUT_FILE_PATH` side packet.
- Prediction graph output tag usage is inconsistent across CPU/GPU/pose graphs.
- Hardcoded local paths appear in calculators/scripts.

These confirm we should reuse architecture ideas, not transplant runtime files.

---

## 4) Implementation backlog (ready-to-run tasks)

## P0 — Artifact contract + serving integrity

- [ ] Define model artifact manifest schema with:
  - model version/hash
  - label map hash/count
  - feature schema version + dims
  - inference thresholds
- [ ] Validate contract before serving `/latest-mlp-model`.
- [ ] Fail fast with explicit error codes when contract is invalid.

**Acceptance**
- Server rejects mismatched label-map/class-count combinations in tests.

## P0 — Fixed-window normalization utility

- [ ] Implement utility to pad/truncate sample windows to configured length.
- [ ] Preserve modality coverage metadata through normalization.
- [ ] Wire utility into existing training pipeline before model fit.

**Acceptance**
- Tests cover short clip, long clip, sparse landmark, and empty-frame scenarios.

## P1 — Unknown-threshold runtime policy

- [ ] Add explicit unknown threshold in runtime inference configuration.
- [ ] Emit telemetry for unknown-rate and low-confidence predictions.
- [ ] Ensure German caregiver-visible wording remains non-judgmental.

**Acceptance**
- Integration test verifies ambiguous gestures prefer unknown over wrong known class.

## P1 — Relative-feature experiment flag

- [x] Add optional relative-delta feature generation mode.
- [x] Add benchmark comparison report: absolute vs relative on sparse profile data.
- [x] Keep absolute mode as default unless benchmark proves otherwise.

**Acceptance**
- Benchmark report committed under `docs/testing/benchmarks/` with recommendation. _Done: `relative_vs_absolute_sparse_profile_report_2026-03-23.md` recommends staying on absolute mode._

## P2 — Diagnostics transparency

- [ ] Expose active runtime recognition config in webapp diagnostics panel.
- [ ] Show model source/version and threshold values used at prediction time.

**Acceptance**
- Manual QA can verify which config/model produced a recognition result.

---

## 5) Minimal handoff for next LLM (if code access is unavailable)

If you cannot access upstream code, use these local references first:

- `docs/training/external/signlanguage_recognition/data_repository.py`
- `docs/training/external/signlanguage_recognition/sign_lang_prediction_calculator.proto`
- `docs/training/DGS_SIGNLANG_REUSE_IMPLEMENTATION_PLAN.md`
- `docs/training/external/signlanguage_recognition/SOURCE_FILE_INDEX.md`

Then implement backlog in section 4 strictly in priority order.
