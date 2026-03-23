# SignLanguageRecognition External Re-check (2026-03-23)

## Why this re-check exists

Before permanently removing the copied `docs/training/external/signlanguage_recognition/*` snapshot, we re-reviewed every extracted file and recorded whether value was:

1. already implemented in Amy's Echo,
2. newly adapted into maintained code,
3. intentionally not adopted.

## Re-check result

- ✅ **One additional code adaptation was added** from the removed snapshot: sweep orchestration for trainer experiments is now available as `server/src/amyserver_tools/train_mlp_sweep.py`.
- ✅ **Previously implemented core adaptations remain in place** (contract validation, unknown-threshold behavior, fixed-window normalization, relative-feature benchmarking/guardrails).
- ✅ **Runtime C++ MediaPipe graph/calculator files were intentionally not ported** because Amy's Echo runtime is TypeScript + Python and those files depended on old MediaPipe/Bazel wiring and local-path assumptions.

## File-by-file disposition

| Removed file | Disposition |
| --- | --- |
| `data_repository.py` | Concept already adopted via fixed-window/normalization path in Amy trainer (`server/training/sliding_window.py` + `server/src/amyserver_tools/train_mlp.py`). |
| `sweep.py` | **Adapted** into maintained Amy script `server/src/amyserver_tools/train_mlp_sweep.py` (grid sweep orchestration). |
| `sweep_cv.py` | Partially covered by the same new sweep script (multi-trial scoring). Full grouped CV remains future optional work. |
| `train-stable.py` | Existing `train_mlp.py` already serves deterministic single-run path with explicit seed/config. |
| `sign_lang_prediction_calculator.proto` | Contract concept already implemented as `artifact_contract` metadata and runtime headers on `/latest-mlp-model`. |
| `runtime/sign_lang_prediction_calculator.cc` | Not adopted directly; architecture mismatch (legacy C++ calculator, old paths, old graph contracts). |
| `runtime/detections_to_csv_calculator.cc` | Not adopted directly; extraction format differs from Amy's maintained landmark pipeline. |
| `runtime/pose_landmarks_to_csv_calculator.cc` | Not adopted directly; redundant with maintained multimodal extraction flow. |
| `runtime/sign_lang_prediction_gpu.pbtxt` | Not adopted directly; graph architecture is legacy/unsupported in current stack. |
| `runtime/sign_lang_prediction_pose_gpu.pbtxt` | Not adopted directly; same rationale as above. |
| `runtime/video_processing_gpu.pbtxt` | Not adopted directly; same rationale as above. |
| `runtime/video_processing_cpu.pbtxt` | Not adopted directly; same rationale as above. |
| `runtime/convert_files.py` | Not adopted directly; Amy pipeline already ingests bundle + landmarks with profile-aware metadata. |
| `runtime/convert_files_pose.py` | Not adopted directly; redundant with maintained training ingestion. |
| `runtime/sign_lang_label_map.txt` | Label-map discipline now represented via `training_metadata.json` labels + contract validation. |
| `CODE_REVIEW_BLIND_SPOT_VALIDATION_2026-03-23.md` | Merged conceptually into maintained playbook/docs; no code artifact needed. |
| `EXTRACTION_COMPLETENESS_AUDIT.md` | Merged conceptually into maintained playbook/docs. |
| `HANDOFF_IMPLEMENTATION_MAP.md` | Merged into maintained plan/playbook and TODO tracking. |
| `README.md` | Replaced by maintained project-owned docs. |
| `SOURCE_FILE_INDEX.md` | Replaced by maintained project-owned docs. |

## Decision

The external copied snapshot can remain removed. Useful value is now either:

- merged into maintained Amy code (`train_mlp_sweep.py`, artifact contract checks), or
- documented as intentionally not portable to the current architecture.
