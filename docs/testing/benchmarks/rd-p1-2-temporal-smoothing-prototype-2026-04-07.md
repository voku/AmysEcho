# RD-P1-2 Temporal Smoothing Prototype Evidence (2026-04-07)

## Summary

Decision: **keep the existing temporal smoothing / sequence-modeling path as a prototype, but do not enable a new production sequence model from this task alone**.

Reason: the current webapp already contains a low-latency prototype stack:

- `MultimodalSmoother` for One Euro filtering across hand, pose, and face landmarks,
- `TemporalGestureAnalyzer` for velocity profiles, confidence smoothing, and dynamic gesture cues,
- `MultiScaleTemporalFeatureExtractor` for short/medium/long temporal feature windows.

The synthetic benchmark below shows the combined prototype stays well below a single 30 fps frame budget, but it is not a substitute for target-device thermal/battery evidence or labeled DGS accuracy evaluation.

## Repro command

```bash
cd webapp
npm run benchmark:temporal-smoothing
```

## Synthetic benchmark output

Generated on 2026-04-07 from `webapp/scripts/benchmark-temporal-smoothing.ts`.

| Variant | avg ms/frame | p95 ms/frame | max ms/frame |
|---|---:|---:|---:|
| Baseline flatten-only | 0.005 | 0.004 | 0.457 |
| Multimodal smoother + temporal analyzer + multi-scale extractor | 0.597 | 1.175 | 3.024 |

| Metric | Value |
|---|---:|
| Raw landmark MAE | 0.003820 |
| Smoothed landmark MAE | 0.003305 |
| Synthetic jitter reduction | 13.49% |
| Dynamic gesture detections | 174 |

## Interpretation

- Accuracy proxy: the synthetic jitter metric improved by 13.49%, so the prototype is directionally useful for landmark stability.
- Latency: p95 `1.175 ms/frame` is below the 33 ms single-frame budget for 30 fps and leaves room for the existing MediaPipe + MLP work.
- Battery / thermal: no production runtime path was changed by this task, so this commit adds no direct device battery or thermal risk. Real battery/thermal impact still needs APR-P0-2 style device captures before enabling any heavier sequence model by default.
- Scope guard: this evidence supports the lightweight smoothing / feature-extractor prototype, not an LSTM/Transformer runtime model.

## Recommendation

Keep the prototype path and benchmark harness. Use it as the comparison baseline for future device captures or labeled DGS fixture evaluations. Do not add a heavier sequence model until there is a labeled dataset showing accuracy gain and target-device evidence showing p95 latency, battery, and thermal impact remain acceptable.

## Verification

- `npm test -- --run src/gesture/utils/MultiScaleTemporalFeatureExtractor.test.ts src/gesture/utils/TemporalGestureAnalyzer.test.ts src/gesture/utils/MultimodalSmoother.test.ts` passed.
- `npm run benchmark:temporal-smoothing` passed.
