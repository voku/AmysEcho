# Baseline Evaluation Report (DGS Recognition)

Use this template to report baseline metrics for the multimodal sign-language model. The goal is to produce a consistent, repeatable summary for each evaluation run.

## Run Metadata

- **Date:** YYYY-MM-DD
- **Model Version:** (global/profile, SHA256 or bundle version)
- **Dataset:** (name, source, split strategy)
- **Device(s):** (device name, OS, browser)
- **Frame Rate Target:** (e.g., 30 FPS)
- **Windowing:** (length, stride)
- **Notes:** (any deviations from standard procedure)

## Metrics Summary

| Metric | Value | Notes |
| --- | --- | --- |
| WER (Word Error Rate) | | Lower is better |
| Gloss Accuracy | | % correct gloss labels |
| Top-1 Accuracy | | Optional if distinct from gloss accuracy |
| Top-3 Accuracy | | Optional |
| Latency (ms/frame) | | Inference latency (p50 / p95) |
| End-to-End Latency (ms) | | Capture → recognition → output |
| Capture FPS | | Average & min FPS |
| Dropped Frame Rate | | % of frames skipped |

## Confusion Highlights

- **Most confused gloss pairs:**
  - gloss_a ↔ gloss_b
  - gloss_c ↔ gloss_d

## Modality Coverage

| Modality | Coverage | Notes |
| --- | --- | --- |
| Hands | | % of frames with hand landmarks |
| Pose | | % of frames with pose landmarks |
| Face | | % of frames with face landmarks |
| Non-manual (derived) | | % of frames with non-manual features |

## Qualitative Review

- **Examples that performed well:**
  - Example 1
  - Example 2
- **Examples that failed:**
  - Example 1
  - Example 2

## Recommendations

- **Immediate fixes:**
  - 
- **Next experiments:**
  - 

