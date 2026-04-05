---
scope: model-runtime-blind-spots
status: active
supersedes:
  - ML_MODEL_TRAINING_USAGE_BLIND_SPOT_ANALYSIS_2026-02-24.md
  - WEBAPP_TRAINED_MODEL_USABILITY_BLIND_SPOT_ANALYSIS_2026-02-25.md
tracked_in: docs/planning/todo.md
---
# Distilled Decision Doc: Trained Model Runtime Reliability (2026-03)

## Purpose

This is the canonical decision document for model-training/runtime blind spots.
It replaces and retires the following overlapping analyses:
- `ML_MODEL_TRAINING_USAGE_BLIND_SPOT_ANALYSIS_2026-02-24.md`
- `WEBAPP_TRAINED_MODEL_USABILITY_BLIND_SPOT_ANALYSIS_2026-02-25.md`

## Non-negotiable decisions

1. **Artifact truth beats UI approximation**
   - "Trained labels" alone must never be treated as proof that a profile model is active.
   - Runtime/model diagnostics must expose artifact-level truth (`profileModelAvailable`, active source, model version).

2. **One recognition decision contract across pipeline and UI**
   - Recorder UI must render the same decision payload emitted by core recognition.
   - Required fields: `reason`, `thresholdUsed`, `trainedLabelAllowed`, `manualOverrideApplied`.

3. **Safety over permissive thresholding**
   - Threshold relaxations are acceptable only with replay-based false-positive guardrails.
   - Household-noise fixtures (low light/jitter) are required for regression checks.

4. **Label normalization is a cross-boundary contract**
   - Trainer, model metadata, trained-label API, and recorder filtering must use one canonical normalization spec.

5. **Manual override is a communication aid, not a quality proof**
   - Manual selection stays enabled for immediate communication continuity.
   - Override frequency must be tracked as model-quality telemetry.

## Resolved contradictions

| Previous tension | Final decision |
|---|---|
| "Show more candidates" vs "avoid wrong outputs" | Keep candidate visibility, but keep conservative auto-emission thresholds and expose reason codes. |
| "UI says trained" vs "runtime fallback active" | Runtime artifact/source status is authoritative; UI must show source badge explicitly. |
| "Manual correction helps" vs "can hide model weakness" | Allow manual correction, but log and review override rates as a quality signal. |

## Implementation order

### P0 (must land first)
- Add authoritative runtime model-source diagnostics (profile vs global fallback).
- Introduce shared `recognitionDecision` contract and wire it end-to-end.

### P1
- Add canonical normalization fixtures reused by webapp and server tests.
- Add replay-based threshold regression coverage for noisy-device scenarios.

### P2
- Add longitudinal dashboards for override rates and source-switch frequency.

## Retirement note

The retired source docs were removed after their actionable content was normalized into the decisions above.
Execution tracking remains in `docs/planning/todo.md`.
