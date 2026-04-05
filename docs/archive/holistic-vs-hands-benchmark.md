# Holistic vs. Hands-only Benchmark Plan

This document outlines how to benchmark MediaPipe Holistic (hands + pose + face) against hands-only on target devices.

## Goals

- Measure FPS, thermal impact, and recognition latency on each device.
- Compare recognition accuracy for multimodal vs hands-only input.

## Devices

- Low-end Android tablet
- Mid-range Android phone
- iPad (current generation)
- Windows laptop (Chrome)

## Scenarios

1. **Hands-only**: hand landmarks only
2. **Holistic**: hands + pose + face landmarks

Each scenario runs for 5 minutes of continuous capture.

## Metrics

- Average FPS
- 5th percentile FPS
- CPU usage
- Battery drain (if available)
- Average inference latency (ms)

## Reporting

Record results using the baseline template in `docs/testing/dgs-baseline-evaluation-template.md` and store raw measurements under `docs/testing/benchmarks/`.
