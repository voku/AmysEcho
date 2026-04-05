---
scope: workflow-alignment-blind-spots
status: active
supersedes:
  - FULL_WORKFLOW_blind-spot-analysis.md
  - BLIND_SPOT_ANALYSIS_2026-03-08.md
tracked_in: docs/planning/todo.md
---
# Distilled Decision Doc: Workflow Reliability + Amy Alignment (2026-03)

## Purpose

This is the canonical decision document for end-to-end workflow and alignment blind spots.
It replaces and retires the following overlapping analyses:
- `FULL_WORKFLOW_blind-spot-analysis.md`
- `BLIND_SPOT_ANALYSIS_2026-03-08.md`

## Canonical decisions

1. **Offline resilience is mandatory, not optional**
   - Recognition must continue with the last valid local model when network fetch fails.

2. **Runtime model-source transparency is required**
   - Caregivers must see whether recognition uses profile model or global fallback.

3. **Multimodal contract integrity must be measurable**
   - Capture → bundle → ingestion → training must preserve modality fields and channel usage evidence.

4. **Symbol mapping reliability is part of recognition reliability**
   - Correct gesture predictions are insufficient if gesture-to-symbol mapping can drift.

5. **Operational cadence prevents slow regressions**
   - Weekly staging verification of model version/source and mapping integrity remains required.

## Resolved contradictions

| Previous tension | Final decision |
|---|---|
| "Feature-rich diagnostics" vs "simple caregiver UI" | Keep caregiver UI simple; detailed diagnostics live in support/debug views. |
| "Strict quality gates" vs "do not block communication" | Use strict gates for training promotion, but keep runtime fallback to maintain communication continuity. |
| "Metacom depth" vs "core gesture loop focus" | Keep Metacom integration where it directly supports communication output; avoid unrelated complexity. |

## Execution priorities

### P0
- Implement durable local model cache + offline fallback loading path.
- Keep explicit runtime source badge (profile model / global fallback).

### P1
- Maintain modality contract tests and training channel-usage summaries.
- Provide one unified diagnostics surface for support triage.

### P2
- Enforce weekly operational runbook checks for source/version/mapping consistency.

## Retirement note

The retired source docs were removed after their actionable content was merged into this decision set.
Execution tracking remains in `docs/planning/todo.md`.
