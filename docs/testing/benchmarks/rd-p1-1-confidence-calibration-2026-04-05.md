# RD-P1-1 — Confidence Calibration & Abstention Validation (2026-04-05)

## Goal

Validate that the current gesture pipeline uses a clear, reproducible confidence policy that prefers safe abstention over wrong labels when confidence is low or ambiguous.

## Threshold policy (implemented behavior)

1. **Primary MLP acceptance threshold:** `mlpConfidence = 0.4` (default config, overridable).  
2. **Low-confidence rejection:** MLP predictions below threshold are rejected with `mlpDecision.reason = below_threshold`.  
3. **Ambiguity guard:** near-tied top candidates are rejected with `below_candidate_margin` to avoid unstable label flips.  
4. **Abstention safety path:** when MediaPipe baseline is generic and MLP disagrees below threshold, the pipeline returns explicit `none` (`gesture = null`, `confidence = 0`) instead of forcing an uncertain label.  
5. **Controlled relaxed override:** profile-specific vocabulary can override baseline labels in a narrow relaxed window (below 0.4 but above the relaxed floor) to reduce baseline bias while keeping explicit decision metadata.

## Calibration evidence table (from deterministic test fixtures)

| Scenario | Inputs | Expected/Observed decision |
|---|---|---|
| Profile vocab rescue below base threshold | Baseline `closed_fist` @ `0.73`, MLP `Trinken` @ `0.31` | **Selected** via `selected_profile_vocab_relaxed_threshold` (method `mlp`). |
| Ambiguous binary tie | MLP candidates `0.50 / 0.50` | **Rejected** with `below_candidate_margin`; output abstains (`gesture = null`, method `none`). |
| Below-threshold disagreement with baseline | Baseline `closed_fist` @ `0.72`, MLP `open_palm` @ `0.34` | **Rejected** with `below_threshold`; explicit abstention (`gesture = null`, `confidence = 0`, method `none`). |
| Below-threshold same-label as baseline | Baseline `closed_fist` @ `0.72`, MLP `closed_fist` @ `0.34` | **Rejected** with `below_threshold`, but baseline retained (`gesture = closed_fist`, method `mediapipe`). |
| Multi-class threshold sweep | Top candidate `0.39` vs `0.58`/`0.61` in fixture matrix | `0.39` cases **reject** (`below_threshold`), `0.58`/`0.61` cases **select** (`selected`). |

## Observability evidence

- Hook-level telemetry emits `mlp_prediction_rejected` with reason/threshold/score/context when threshold rejection happens in live message handling.
- `installMlp` suppresses explicit `_NULL_` top predictions (returns `null`) so the UI avoids showing uncertain null-class labels as user-facing gestures.

## Commands executed

```bash
npm test --prefix webapp -- src/gesture/core/GestureDetectionStep.test.ts
npm test --prefix webapp -- src/hooks/useSignLanguageDetector.test.tsx
npm test --prefix webapp -- src/gesture/installMlp.test.ts
```

All commands passed on 2026-04-05 in this workspace.
