# SignLanguageRecognition source index (high-value files)

Upstream: https://github.com/Tachionstrahl/SignLanguageRecognition  
Commit: `d6358d5994163b48cbd2857300c826e082d03aa3` (2022-10-09)

This index is intentionally limited to implementation-relevant source files for training/inference migration.

## Runtime graphs + calculators (`src/`)

- `src/app/run_graph_main_gpu.cc` — graph runner for webcam/video/directory ingestion
- `src/calculators/detections_to_csv_calculator.cc` — face+hand landmark CSV writer
- `src/calculators/pose_landmarks_to_csv_calculator.cc` — pose landmark CSV writer
- `src/calculators/sign_lang_prediction_calculator.cc` — temporal frame window + TFLite prediction
- `src/calculators/sign_lang_prediction_calculator.proto` — inference options contract
- `src/calculators/text_to_render_data_calculator.cc` — subtitle overlay render data
- `src/calculators/sentenizer_calculator.cc` — rolling sentence output formatter
- `src/graphs/video_processing_gpu.pbtxt` — GPU extraction graph (to CSV)
- `src/graphs/video_processing_cpu.pbtxt` — CPU extraction graph (contains contract mismatch risk)
- `src/graphs/sign_lang_prediction_gpu.pbtxt` — live prediction graph
- `src/graphs/sign_lang_prediction_cpu.pbtxt` — CPU prediction graph
- `src/graphs/sign_lang_prediction_pose_gpu.pbtxt` — pose prediction graph (contains model-path mismatch)
- `src/graphs/pose_to_csv_gpu.pbtxt` — pose-to-CSV graph
- `src/convert_files.py` / `src/convert_files_pose.py` — batch conversion wrappers

## Training scripts (`lab/`)

- `lab/data_repository.py` — fixed-window normalization and one-hot label preparation
- `lab/sweep.py` — single-run W&B hyperparameter training script
- `lab/sweep_cv.py` — cross-validation W&B sweep script
- `lab/train-stable.py` — multi-process CV training script

## Models + labels

- `src/models/*.tflite` — trained RNN variants
- `src/models/sign_lang_label_map.txt` — class index ↔ gloss map

## Known upstream portability hazards (must not be copied as-is)

- Hardcoded absolute paths: `/home/signlang`, `/home/michi`
- Legacy environment assumptions (old Ubuntu/Bazel/MediaPipe/TensorFlow)
- Graph contract mismatches (notably side packet/tag inconsistencies)
