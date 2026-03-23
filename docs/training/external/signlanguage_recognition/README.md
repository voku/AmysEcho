# Extracted reference assets from Tachionstrahl/SignLanguageRecognition

Source repository: https://github.com/Tachionstrahl/SignLanguageRecognition  
Source commit: `d6358d5994163b48cbd2857300c826e082d03aa3` (master, 2022-10-09)  
Original license: Apache-2.0 (see upstream `LICENSE`).

## Purpose

These files are copied as **reference material** to accelerate Amy's Echo DGS pipeline hardening.
They are not wired into production code directly.

## Included files

### Training-side references

- `data_repository.py`
  - Upstream: `lab/data_repository.py`
  - Useful idea: stable frame-count normalization (`frames=100`), zero-padding, label binarization.
- `sweep.py`
  - Upstream: `lab/sweep.py`
  - Useful idea: hyperparameter sweep structure for LSTM/BiLSTM variants.
- `sweep_cv.py`
  - Upstream: `lab/sweep_cv.py`
  - Useful idea: CV-aware experiment orchestration and result comparison pattern.
- `train-stable.py`
  - Upstream: `lab/train-stable.py`
  - Useful idea: reproducible single-run baseline training path with explicit metrics.

### Runtime-side references

- `sign_lang_prediction_calculator.proto`
  - Upstream: `src/calculators/sign_lang_prediction_calculator.proto`
  - Useful idea: explicit runtime options contract for temporal inference behavior (window size, min frames, threshold, relative features, model path).
- `runtime/sign_lang_prediction_calculator.cc`
  - Upstream: `src/calculators/sign_lang_prediction_calculator.cc`
  - Useful idea: streaming frame-window inference flow and relative/absolute feature preprocessing structure.
- `runtime/detections_to_csv_calculator.cc`
  - Upstream: `src/calculators/detections_to_csv_calculator.cc`
  - Useful idea: deterministic landmark-to-CSV extraction contract.
- `runtime/pose_landmarks_to_csv_calculator.cc`
  - Upstream: `src/calculators/pose_landmarks_to_csv_calculator.cc`
  - Useful idea: pose extraction contract and serialization pattern.
- `runtime/sign_lang_prediction_gpu.pbtxt`
  - Upstream: `src/graphs/sign_lang_prediction_gpu.pbtxt`
  - Useful idea: graph-level streaming assembly for real-time prediction.
- `runtime/sign_lang_prediction_pose_gpu.pbtxt`
  - Upstream: `src/graphs/sign_lang_prediction_pose_gpu.pbtxt`
  - Useful idea: pose-aware prediction topology reference.
- `runtime/video_processing_gpu.pbtxt`
  - Upstream: `src/graphs/video_processing_gpu.pbtxt`
  - Useful idea: extraction graph wiring for GPU capture pipelines.
- `runtime/video_processing_cpu.pbtxt`
  - Upstream: `src/graphs/video_processing_cpu.pbtxt`
  - Useful idea: extraction graph wiring for CPU fallback pipelines.
- `runtime/convert_files.py`
  - Upstream: `src/convert_files.py`
  - Useful idea: batch conversion workflow (video to extracted sequences).
- `runtime/convert_files_pose.py`
  - Upstream: `src/convert_files_pose.py`
  - Useful idea: pose-specific conversion workflow.
- `runtime/sign_lang_label_map.txt`
  - Upstream: `src/models/sign_lang_label_map.txt`
  - Useful idea: runtime label-map discipline between training and serving.

## Adaptation rule

Before reusing any logic in `server/` or `webapp/`, convert to Amy's Echo naming, profile-aware behavior, tests, and German caregiver UX constraints.

Do not import these files directly into runtime paths; treat them as upstream reference snapshots.
