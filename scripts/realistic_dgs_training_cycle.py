#!/usr/bin/env python3
"""Run a realistic DGS training cycle using repository landmark videos and held-out validation."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import random
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = PROJECT_ROOT / "server"
SERVER_DATA = SERVER_DIR / "data"
VIDEO_DIR = SERVER_DATA / "dgs_video_examples"
TRAINER_SCRIPT = SERVER_DIR / "src" / "amyserver_tools" / "train_mlp.py"
BASELINE_MODEL_PATH = SERVER_DATA / "models" / "global" / "amy_model.npz"
FEATURE_SCHEMA_PATH = PROJECT_ROOT / "spec" / "feature_schema.json"
STDERR_SUMMARY_LINES = 20


def load_trainer_module() -> Any:
    sys.path.insert(0, str(SERVER_DIR / "src"))
    return importlib.import_module("amyserver_tools.train_mlp")


def load_model_weights(model_path: Path) -> tuple[Any, list[str], dict[str, Any]]:
    sys.path.insert(0, str(SERVER_DIR / "src"))
    from amyserver_tools.model_serialization import load_model

    return load_model(model_path)


@dataclass
class EvaluationResult:
    model_path: str
    sample_count: int
    known_label_samples: int
    unknown_label_samples: int
    top1_accuracy: float
    macro_f1: float
    label_coverage: dict[str, int]
    skipped_labels: list[str]


@dataclass
class AttemptResult:
    attempt: int
    seed: int
    epochs: int
    timeout_seconds: int
    training_report: dict[str, Any]
    evaluation: EvaluationResult
    meets_usable_threshold: bool


def _relative_eval_dict(result: EvaluationResult) -> dict[str, Any]:
    """Return asdict(result) with model_path made relative to PROJECT_ROOT."""
    eval_dict = asdict(result)
    abs_model_path = Path(eval_dict["model_path"])
    if abs_model_path.is_relative_to(PROJECT_ROOT):
        eval_dict["model_path"] = str(abs_model_path.relative_to(PROJECT_ROOT))
    return eval_dict


def extract_label_from_landmark_file(path: Path) -> str:
    stem = path.name.removesuffix("_landmarks.json")

    main_index = stem.find("_main_")
    var_index = stem.find("_var_")
    valid_indices = [index for index in (main_index, var_index) if index != -1]
    if valid_indices:
        return stem[: min(valid_indices)]

    return stem


def landmark_file_has_signal(path: Path) -> bool:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    for frame in payload.get("frames", []):
        landmarks = frame.get("landmarks")
        if isinstance(landmarks, list) and len(landmarks) > 0:
            return True
    return False


def load_hand_feature_contract() -> dict[str, Any]:
    schema = json.loads(FEATURE_SCHEMA_PATH.read_text(encoding="utf-8"))
    contract = schema["handFeatureContract"]
    return {
        "version": contract["version"],
        "normalization": contract["normalization"],
        "handOrder": contract["handOrder"],
        "missingHandStrategy": contract["missingHandStrategy"],
        "pointsPerHand": schema["landmarks"]["hands"]["perHand"],
        "coordinatesPerPoint": schema["coordinatesPerLandmark"],
        "vectorLength": contract["vectorLength"],
    }


def build_entries(landmark_files: list[Path]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    feature_contract = load_hand_feature_contract()
    for landmark_file in landmark_files:
        entries.append(
            {
                "id": landmark_file.stem,
                "label": extract_label_from_landmark_file(landmark_file),
                "profileId": None,
                "storage": {
                    "directory": "dgs_video_examples",
                    "files": [landmark_file.name],
                },
                "metadata": {
                    "source": "realistic_dgs_training_cycle",
                    "landmarkFile": landmark_file.name,
                    "featureContract": feature_contract,
                    "validationSummary": {"landmarksPath": landmark_file.name},
                },
            }
        )
    return entries


def split_train_eval(
    landmark_files: list[Path],
    holdout_ratio: float,
    max_files_per_label: int | None = None,
    seed: int = 20260301,
) -> tuple[list[Path], list[Path], dict[str, int]]:
    grouped: dict[str, list[Path]] = defaultdict(list)
    for file_path in sorted(landmark_files):
        grouped[extract_label_from_landmark_file(file_path)].append(file_path)

    train_files: list[Path] = []
    eval_files: list[Path] = []
    label_totals: dict[str, int] = {}

    for label, files in grouped.items():
        shuffled_files = list(files)
        label_seed_bytes = hashlib.sha256(label.encode("utf-8")).digest()[:8]
        label_seed = int.from_bytes(label_seed_bytes, "big")
        random.Random(seed + label_seed).shuffle(shuffled_files)
        files = shuffled_files
        if max_files_per_label is not None and max_files_per_label > 0:
            files = files[:max_files_per_label]

        label_totals[label] = len(files)
        if len(files) < 2:
            train_files.extend(files)
            continue

        eval_count = max(1, round(len(files) * holdout_ratio))
        eval_count = min(eval_count, len(files) - 1)
        eval_files.extend(files[:eval_count])
        train_files.extend(files[eval_count:])

    return train_files, eval_files, label_totals


def parse_epoch_schedule(raw_value: str) -> list[int]:
    values = [chunk.strip() for chunk in raw_value.split(",") if chunk.strip()]
    epochs: list[int] = []
    for value in values:
        try:
            epoch = int(value)
        except ValueError as exc:
            raise ValueError("--epoch-schedule must contain positive integers, e.g. '300,600,900'") from exc

        if epoch <= 0:
            raise ValueError("--epoch-schedule must contain positive integers, e.g. '300,600,900'")
        epochs.append(epoch)

    if not epochs:
        raise ValueError("--epoch-schedule must contain positive integers, e.g. '300,600,900'")
    return epochs


def write_manifest(path: Path, entries: list[dict[str, Any]]) -> None:
    payload = {
        "version": "1.0",
        "generatedAt": datetime.now(UTC).isoformat(),
        "entries": entries,
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def run_training_attempt(
    manifest_path: Path,
    output_dir: Path,
    epochs: int,
    timeout_s: int,
    seed: int,
) -> dict[str, Any]:
    command = [
        sys.executable,
        str(TRAINER_SCRIPT),
        "--manifest",
        str(manifest_path),
        "--data-dir",
        str(SERVER_DATA),
        "--output-dir",
        str(output_dir),
        "--epochs",
        str(epochs),
        "--seed",
        str(seed),
        "--skip-examples",
    ]

    process = subprocess.Popen(
        command,
        cwd=str(PROJECT_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    stdout_captured = []
    stderr_captured = []

    import threading

    def capture_stderr():
        for line in process.stderr:
            stderr_captured.append(line)
            # Optional: print(f"  [stderr] {line.strip()}", file=sys.stderr)

    stderr_thread = threading.Thread(target=capture_stderr)
    stderr_thread.start()

    try:
        # Read stdout in real-time to prevent buffer bloat and provide feedback
        for line in process.stdout:
            stdout_captured.append(line)
            # Only print relevant events to stderr, suppress full final report which is huge
            if '"type":' in line or "epoch" in line.lower():
                print(f"  [trainer] {line.strip()}", file=sys.stderr)
            elif len(line) < 500: # Print short lines (usually status or errors)
                print(f"  [trainer] {line.strip()}", file=sys.stderr)

        process.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        process.kill()
        raise

    stderr_thread.join()

    stdout = "".join(stdout_captured)
    stderr = "".join(stderr_captured)

    payload = {
        "returncode": process.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "command": command,
    }

    if process.returncode != 0:
        raise RuntimeError(json.dumps(payload, indent=2))

    try:
        report = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Failed to parse trainer output as JSON: {exc}. stdout: {stdout}"
        ) from exc

    if "error" in report:
        raise RuntimeError(f"Training returned error payload: {report['error']}")

    payload["report"] = report
    return payload


def forward_pass(
    X: np.ndarray,
    weights: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray],
) -> np.ndarray:
    w1, b1, w2, b2, w3, b3 = weights
    z1 = np.dot(X, w1) + b1
    a1 = np.maximum(z1, 0)
    z2 = np.dot(a1, w2) + b2
    a2 = np.maximum(z2, 0)
    z3 = np.dot(a2, w3) + b3
    exp = np.exp(z3 - np.max(z3, axis=1, keepdims=True))
    return exp / np.sum(exp, axis=1, keepdims=True)


def macro_f1_from_predictions(targets: np.ndarray, predictions: np.ndarray, class_count: int) -> float:
    scores: list[float] = []
    for class_index in range(class_count):
        true_positive = np.sum((targets == class_index) & (predictions == class_index))
        false_positive = np.sum((targets != class_index) & (predictions == class_index))
        false_negative = np.sum((targets == class_index) & (predictions != class_index))

        precision = true_positive / (true_positive + false_positive) if (true_positive + false_positive) > 0 else 0.0
        recall = true_positive / (true_positive + false_negative) if (true_positive + false_negative) > 0 else 0.0
        if precision + recall == 0:
            scores.append(0.0)
        else:
            scores.append(2 * precision * recall / (precision + recall))

    return float(np.mean(scores)) if scores else 0.0


def evaluate_model(model_path: Path, eval_manifest_path: Path) -> EvaluationResult:
    trainer = load_trainer_module()
    eval_samples, _ = trainer.build_samples_from_manifest(eval_manifest_path, skip_examples=True)
    if not eval_samples:
        raise RuntimeError("No evaluation samples were generated from held-out files.")

    X_eval, y_eval, eval_labels, _weights, _groups = trainer.dataset_to_arrays(eval_samples, augmentations_per_sample=0)
    weights, model_labels, _ = load_model_weights(model_path)

    coverage = dict.fromkeys(eval_labels, 0)
    for sample in eval_samples:
        coverage[sample.label] = coverage.get(sample.label, 0) + 1

    eval_index_to_label = dict(enumerate(eval_labels))
    model_label_to_index = {label: index for index, label in enumerate(model_labels)}

    known_indices: list[int] = []
    known_targets: list[int] = []
    skipped_labels: set[str] = set()

    for sample_index, y_value in enumerate(y_eval):
        label = eval_index_to_label[int(y_value)]
        mapped = model_label_to_index.get(label)
        if mapped is None:
            skipped_labels.add(label)
            continue
        known_indices.append(sample_index)
        known_targets.append(mapped)

    if not known_indices:
        return EvaluationResult(
            model_path=str(model_path),
            sample_count=int(X_eval.shape[0]),
            known_label_samples=0,
            unknown_label_samples=int(X_eval.shape[0]),
            top1_accuracy=0.0,
            macro_f1=0.0,
            label_coverage=coverage,
            skipped_labels=sorted(skipped_labels),
        )

    known_array = np.array(known_indices)
    X_known = X_eval[known_array]
    targets = np.array(known_targets)
    probs = forward_pass(X_known, weights)
    predictions = np.argmax(probs, axis=1)

    return EvaluationResult(
        model_path=str(model_path),
        sample_count=int(X_eval.shape[0]),
        known_label_samples=len(known_indices),
        unknown_label_samples=int(X_eval.shape[0]) - len(known_indices),
        top1_accuracy=float(np.mean(predictions == targets)),
        macro_f1=macro_f1_from_predictions(targets, predictions, len(np.unique(targets))),
        label_coverage=coverage,
        skipped_labels=sorted(skipped_labels),
    )


def resolve_epoch_for_attempt(epoch_schedule: list[int], attempt_index: int) -> int:
    if attempt_index < len(epoch_schedule):
        return epoch_schedule[attempt_index]
    return epoch_schedule[-1]




def apply_workflow_preset(
    preset: str,
    attempts: int,
    epoch_schedule: list[int],
    max_files_per_label: int | None,
    usable_accuracy: float,
) -> tuple[int, list[int], int | None, float]:
    if preset != "chat-validated-2026-03":
        return attempts, epoch_schedule, max_files_per_label, usable_accuracy

    return 3, [20, 40, 80], 3, 0.35

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--workflow-preset", type=str, default="none", choices=["none", "chat-validated-2026-03"])
    parser.add_argument("--holdout-ratio", type=float, default=0.2)
    parser.add_argument("--usable-accuracy", type=float, default=0.35)
    parser.add_argument("--max-files-per-label", type=int, default=10)
    parser.add_argument("--timeout-seconds", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20260301)
    parser.add_argument("--epoch-schedule", type=str, default="20,40,80")
    parser.add_argument("--keep-attempt-artifacts", action="store_true")
    parser.add_argument("--save-best-model-to", type=Path, default=None)
    parser.add_argument("--promote-best-global-model", action="store_true")
    parser.add_argument("--auto-promote-on-usable", action="store_true")
    parser.add_argument(
        "--report-path",
        type=Path,
        default=SERVER_DATA / "datasets" / "realistic_dgs_cycle_report.json",
    )
    args = parser.parse_args()

    epoch_schedule = parse_epoch_schedule(args.epoch_schedule)
    attempts, epoch_schedule, max_files_per_label, usable_accuracy = apply_workflow_preset(
        args.workflow_preset,
        args.attempts,
        epoch_schedule,
        args.max_files_per_label,
        args.usable_accuracy,
    )

    landmark_files = sorted(VIDEO_DIR.glob("*_landmarks.json"))
    if not landmark_files:
        raise RuntimeError(f"No landmark files were found in {VIDEO_DIR}")

    landmark_files = [file for file in landmark_files if landmark_file_has_signal(file)]
    if not landmark_files:
        raise RuntimeError("No usable landmark files with non-empty hand landmarks were found.")

    train_files, eval_files, label_totals = split_train_eval(
        landmark_files,
        args.holdout_ratio,
        max_files_per_label=max_files_per_label,
        seed=args.seed,
    )

    if not eval_files:
        raise RuntimeError("No holdout evaluation files were created. Increase files per label or holdout ratio.")

    run_started = datetime.now(UTC).isoformat()
    attempts_payload: list[dict[str, Any]] = []
    best_attempt: AttemptResult | None = None

    datasets_dir = SERVER_DATA / "datasets"
    datasets_dir.mkdir(parents=True, exist_ok=True)

    temp_dir = tempfile.mkdtemp(prefix="realistic_dgs_cycle_", dir=str(datasets_dir))
    temp_root = Path(temp_dir)

    try:
        train_manifest_path = temp_root / "train_manifest.json"
        eval_manifest_path = temp_root / "eval_manifest.json"

        write_manifest(train_manifest_path, build_entries(train_files))
        write_manifest(eval_manifest_path, build_entries(eval_files))

        baseline_result: EvaluationResult | None = None
        baseline_error: str | None = None
        if BASELINE_MODEL_PATH.exists():
            try:
                baseline_result = evaluate_model(BASELINE_MODEL_PATH, eval_manifest_path)
            except Exception as exc:  # baseline file may be missing/corrupt (e.g. Git LFS pointer)
                baseline_error = str(exc)

        for attempt_index in range(attempts):
            attempt_number = attempt_index + 1
            epochs = resolve_epoch_for_attempt(epoch_schedule, attempt_index)
            output_dir = temp_root / f"models_attempt_{attempt_number}"
            output_dir.mkdir(parents=True, exist_ok=True)

            training_payload = run_training_attempt(
                train_manifest_path,
                output_dir,
                epochs,
                args.timeout_seconds,
                args.seed + attempt_number,
            )

            model_path = output_dir / "global" / "amy_model.npz"
            eval_result = evaluate_model(model_path, eval_manifest_path)

            attempt = AttemptResult(
                attempt=attempt_number,
                seed=args.seed + attempt_number,
                epochs=epochs,
                timeout_seconds=args.timeout_seconds,
                training_report=training_payload["report"],
                evaluation=eval_result,
                meets_usable_threshold=eval_result.top1_accuracy >= usable_accuracy,
            )

            stderr_lines = training_payload["stderr"].splitlines()
            stderr_summary = "\n".join(stderr_lines[-STDERR_SUMMARY_LINES:]) if len(stderr_lines) > STDERR_SUMMARY_LINES else training_payload["stderr"]
            rel_model_path = model_path.relative_to(PROJECT_ROOT) if model_path.is_relative_to(PROJECT_ROOT) else model_path
            attempts_payload.append(
                {
                    "attempt": attempt.attempt,
                    "seed": attempt.seed,
                    "epochs": attempt.epochs,
                    "timeoutSeconds": attempt.timeout_seconds,
                    "trainingReport": attempt.training_report,
                    "evaluation": _relative_eval_dict(attempt.evaluation),
                    "stderrSummary": stderr_summary,
                    "meetsUsableThreshold": attempt.meets_usable_threshold,
                    "modelPath": str(rel_model_path),
                }
            )

            if best_attempt is None or attempt.evaluation.top1_accuracy > best_attempt.evaluation.top1_accuracy:
                best_attempt = attempt

            if attempt.meets_usable_threshold:
                break

        if best_attempt is None:
            raise RuntimeError("Training attempts did not produce an evaluable model.")

        best_model_path = Path(best_attempt.evaluation.model_path)
        if args.save_best_model_to is not None:
            args.save_best_model_to.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(best_model_path, args.save_best_model_to)

        promoted_model_path = None
        should_promote = args.promote_best_global_model or (args.auto_promote_on_usable and best_attempt.meets_usable_threshold)
        if should_promote:
            BASELINE_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(best_model_path, BASELINE_MODEL_PATH)
            for filename in ["training_metadata.json", f"{best_model_path.name}.sha256"]:
                source_file = best_model_path.parent / filename
                if source_file.exists():
                    shutil.copy2(source_file, BASELINE_MODEL_PATH.parent / filename)
            promoted_model_path = str(BASELINE_MODEL_PATH.relative_to(PROJECT_ROOT))

        artifact_mode = "retained" if args.keep_attempt_artifacts else "temporary"
        report_payload = {
            "startedAt": run_started,
            "finishedAt": datetime.now(UTC).isoformat(),
            "videoSourceDirectory": str(VIDEO_DIR.relative_to(PROJECT_ROOT)),
            "landmarkFilesDiscovered": len(landmark_files),
            "trainFiles": [file.name for file in train_files],
            "evalFiles": [file.name for file in eval_files],
            "labelTotals": label_totals,
            "usableAccuracyThreshold": usable_accuracy,
            "attemptCountRequested": attempts,
            "attemptCountExecuted": len(attempts_payload),
            "epochSchedule": epoch_schedule,
            "workflowPreset": args.workflow_preset,
            "timeoutSeconds": args.timeout_seconds,
            "baselineEvaluation": _relative_eval_dict(baseline_result) if baseline_result else None,
            "baselineEvaluationError": baseline_error,
            "bestAttempt": {
                "attempt": best_attempt.attempt,
                "seed": best_attempt.seed,
                "epochs": best_attempt.epochs,
                "evaluation": _relative_eval_dict(best_attempt.evaluation),
                "meetsUsableThreshold": best_attempt.meets_usable_threshold,
            },
            "allAttempts": attempts_payload,
            "promotedModelPath": promoted_model_path,
            "gates": {
                "holdoutSetNonEmpty": len(eval_files) > 0,
                "bestKnownLabelSamples": best_attempt.evaluation.known_label_samples,
                "usableAccuracyReached": best_attempt.meets_usable_threshold,
                "artifactMode": artifact_mode,
            },
        }

    finally:
        if not args.keep_attempt_artifacts:
            shutil.rmtree(temp_root, ignore_errors=True)

    args.report_path.parent.mkdir(parents=True, exist_ok=True)
    args.report_path.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "status": "ok",
                "reportPath": str(args.report_path),
                "bestAccuracy": best_attempt.evaluation.top1_accuracy,
                "bestMacroF1": best_attempt.evaluation.macro_f1,
                "attempts": len(attempts_payload),
                "usable": best_attempt.meets_usable_threshold,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
