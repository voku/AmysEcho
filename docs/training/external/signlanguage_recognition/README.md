# Extracted reference assets from Tachionstrahl/SignLanguageRecognition

Source repository: https://github.com/Tachionstrahl/SignLanguageRecognition  
Source commit: `d6358d5994163b48cbd2857300c826e082d03aa3` (master, 2022-10-09)  
Original license: Apache-2.0 (see upstream `LICENSE`).

## Purpose

These files are copied as **reference material** to accelerate Amy's Echo DGS pipeline hardening.
They are not wired into production code directly.

## Included files

- `data_repository.py`
  - Upstream: `lab/data_repository.py`
  - Useful idea: stable frame-count normalization (`frames=100`), zero-padding, label binarization.
- `sign_lang_prediction_calculator.proto`
  - Upstream: `src/calculators/sign_lang_prediction_calculator.proto`
  - Useful idea: explicit runtime options contract for temporal inference behavior (window size, min frames, threshold, relative features, model path).

## Adaptation rule

Before reusing any logic in `server/` or `webapp/`, convert to Amy's Echo naming, profile-aware behavior, tests, and German caregiver UX constraints.
