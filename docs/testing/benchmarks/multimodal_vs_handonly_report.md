# Benchmark Report: Multimodal vs Hand-only MLP

This snapshot records a baseline comparison between multimodal and hand-only
training using the current deterministic fixtures. It is intended as a **seed**
report so follow-up device-specific benchmarks can be appended later.

## Run Metadata

- **Date:** 2026-02-03
- **Model Version:** Global baseline (`server/data/models/global/amy_model.npz`, checksum `55e5c18da29cd012773d75d6ef10e27636e0ddeec642490ac4d24e4222e8383c`)
- **Dataset:** `data/dgs_samples.json` (deterministic synthetic seed data)
- **Device(s):** CI (Linux runner, CPU-only)
- **Frame Rate Target:** N/A (offline training run)
- **Windowing:** `window_size = 6` (see `server/data/models/global/training_metadata.json`)
- **Notes:** Metrics recorded from `train_mlp.py` output when running the deterministic baseline. Real device capture benchmarks should be appended here.

## Metrics Summary

| Metric | Multimodal | Hand-only | Notes |
| --- | --- | --- | --- |
| Training accuracy | 33.3% | 33.3% | Integration test training metrics (single-class fixtures) |
| Sample count | 3 | 3 | Integration test bundles (`multimodal-training-flow.test.ts`) |
| Modalities present | Hands + Pose + Face | Hands | Multimodal integration fixtures include pose/face landmarks |
| Bundle frames | N/A | N/A | Offline baseline does not use bundle frames |
| Training duration | N/A | N/A | Not captured in deterministic snapshot |

## Modality Coverage

| Modality | Coverage | Notes |
| --- | --- | --- |
| Hands | 100% | Required for all fixtures |
| Pose | 100% | Present in multimodal fixtures |
| Face | 100% | Present in multimodal fixtures |
| Non-manual (derived) | 100% | Derived from multimodal landmarks |

## Qualitative Review

- **Examples that performed well:** Synthetic seed sample only (no real-world samples)
- **Examples that failed:** Not evaluated; no live capture data in this snapshot

## Recommendations

- **Immediate fixes:**
  - Capture real device benchmarks per `docs/training/HOLISTIC_VS_HANDS_BENCHMARK.md`.
- **Next experiments:**
  - Add WER/Gloss accuracy measurements with caregiver-recorded samples.
  - Record thermal + FPS data on target tablets and phones.
