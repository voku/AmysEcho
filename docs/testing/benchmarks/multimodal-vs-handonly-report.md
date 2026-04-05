# Benchmark Report: Multimodal vs Hand-only MLP

This snapshot records a baseline hand-only benchmark using the current
deterministic fixtures. It is intended as a **seed** report; multimodal
comparisons require a dataset with pose/face landmarks and are still pending.

## Run Metadata

- **Date:** 2026-02-03
- **Model Version:** Global baseline (`server/data/models/global/amy_model.npz`, checksum `55e5c18da29cd012773d75d6ef10e27636e0ddeec642490ac4d24e4222e8383c`)
- **Dataset:** `data/dgs_samples.json` (deterministic synthetic seed data)
- **Device(s):** CI (Linux runner, CPU-only)
- **Frame Rate Target:** N/A (offline training run)
- **Windowing:** `window_size = 6` (see `server/data/models/global/training_metadata.json`)
- **Notes:** Metrics recorded from `train_mlp.py` output when running the deterministic baseline. Real device capture benchmarks should be appended here.

## Metrics Summary

| Metric | Hand-only | Multimodal | Notes |
| --- | --- | --- | --- |
| Training accuracy | 33.3% | N/A | Deterministic baseline run (single-class fixture) |
| Sample count | 1 | N/A | Seed sample in `data/dgs_samples.json` |
| Modalities present | Hands | N/A | Baseline seed contains hand landmarks only |
| Bundle frames | N/A | N/A | Offline baseline does not use bundle frames |
| Training duration | N/A | N/A | Not captured in deterministic snapshot |

## Modality Coverage

| Modality | Coverage | Notes |
| --- | --- | --- |
| Hands | 100% | Present in deterministic seed |
| Pose | 0% | Not present in seed |
| Face | 0% | Not present in seed |
| Non-manual (derived) | 0% | Not available without pose/face |

## Qualitative Review

- **Examples that performed well:** Synthetic seed sample only (no real-world samples)
- **Examples that failed:** Not evaluated; no live capture data in this snapshot

## Recommendations

- **Immediate fixes:**
  - Capture multimodal benchmarks per `docs/training/holistic-vs-hands-benchmark.md`.
- **Next experiments:**
  - Add WER/Gloss accuracy measurements with caregiver-recorded samples.
  - Record thermal + FPS data on target tablets and phones.
