#!/usr/bin/env python3
"""Run few-shot training trials for train_mlp.py with signer-safe profile holdout."""

from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import statistics
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np

try:
    from amyserver_tools import train_mlp as train_mlp_module
    from amyserver_tools.train_mlp_sweep import _extract_score, _parse_training_report
    from amyserver_tools.train_mlp import (
        _compute_accuracy,
        _compute_f1_score,
        build_samples_from_manifest,
        dataset_to_arrays,
    )
except ModuleNotFoundError:
    import train_mlp as train_mlp_module
    from train_mlp_sweep import _extract_score, _parse_training_report
    from train_mlp import _compute_accuracy, _compute_f1_score, build_samples_from_manifest, dataset_to_arrays


NULL_CLASS_LABEL = "_null_"


def _parse_int_list(raw: str) -> list[int]:
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return [int(value) for value in values]


def _load_manifest_entries(manifest_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        entries = payload.get("entries")
        if not isinstance(entries, list):
            raise ValueError("Manifest object must contain a list at 'entries'")
        return [entry for entry in entries if isinstance(entry, dict)]
    if isinstance(payload, list):
        return [entry for entry in payload if isinstance(entry, dict)]
    raise ValueError("Manifest must be a list or object containing 'entries'")


def _normalize_label(label: str) -> str:
    return " ".join(label.strip().split()).lower()


def _entry_profile(entry: dict[str, Any]) -> str:
    profile = entry.get("profileId")
    if isinstance(profile, str) and profile.strip():
        return profile.strip()
    return "unassigned-profile"


def _entry_bundle(entry: dict[str, Any]) -> str:
    for key in ("source_bundle_id", "id"):
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise ValueError(f"Manifest entry missing source bundle id: {entry}")


def _entry_label(entry: dict[str, Any]) -> str:
    raw = entry.get("label")
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError(f"Manifest entry missing label: {entry}")
    normalized = _normalize_label(raw)
    if normalized == NULL_CLASS_LABEL:
        raise ValueError("Few-shot runner does not accept _null_ labels in manifest entries")
    return normalized


def _partition_profiles(
    profiles: list[str],
    seed: int,
    explicit_test_profiles: list[str],
    test_fraction: float,
) -> tuple[list[str], list[str]]:
    if explicit_test_profiles:
        explicit_set = set(explicit_test_profiles)
        test_profiles = [profile for profile in profiles if profile in explicit_set]
    else:
        shuffled = list(profiles)
        random.Random(seed).shuffle(shuffled)
        requested = max(1, round(len(shuffled) * test_fraction))
        requested = min(len(shuffled) - 1, requested) if len(shuffled) > 1 else 1
        test_profiles = shuffled[:requested]

    train_profiles = [profile for profile in profiles if profile not in set(test_profiles)]
    if not train_profiles:
        raise ValueError("No train profiles available after holdout split")
    if not test_profiles:
        raise ValueError("No test profiles selected for few-shot split")
    return train_profiles, test_profiles


def _sample_train_entries(
    train_entries: list[dict[str, Any]],
    shot: int,
    seed: int,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    by_label: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for entry in train_entries:
        label = _entry_label(entry)
        bundle_id = _entry_bundle(entry)
        by_label[label][bundle_id] = entry

    rng = random.Random(seed)
    selected: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for label in sorted(by_label.keys()):
        bundle_map = by_label[label]
        bundle_ids = list(bundle_map.keys())
        if len(bundle_ids) < shot:
            continue
        rng.shuffle(bundle_ids)
        selected_ids = bundle_ids[:shot]
        counts[label] = len(selected_ids)
        selected.extend(bundle_map[bundle_id] for bundle_id in selected_ids)

    if not counts:
        raise ValueError(
            f"No labels had enough samples for shot={shot}. Ensure at least one label has >= shot bundles."
        )

    return selected, counts


def _validate_split_manifest(split_manifest: dict[str, Any]) -> None:
    required = {
        "seed",
        "shot",
        "train_profiles",
        "test_profiles",
        "train_bundles",
        "test_bundles",
        "train_samples_per_label",
        "test_samples_per_label",
    }
    missing = [key for key in required if key not in split_manifest]
    if missing:
        raise ValueError(f"Split manifest missing required fields: {', '.join(missing)}")

    train_profiles_raw = split_manifest["train_profiles"]
    test_profiles_raw = split_manifest["test_profiles"]
    train_bundles_raw = split_manifest["train_bundles"]
    test_bundles_raw = split_manifest["test_bundles"]

    if not isinstance(train_profiles_raw, list) or not isinstance(test_profiles_raw, list):
        raise ValueError("Split manifest invalid signer split: train_profiles and test_profiles must be lists")
    if not isinstance(train_bundles_raw, list) or not isinstance(test_bundles_raw, list):
        raise ValueError("Split manifest invalid bundle split: train_bundles and test_bundles must be lists")

    if not train_profiles_raw or not test_profiles_raw:
        raise ValueError("Split manifest invalid signer split: train_profiles and test_profiles must be non-empty")
    if not train_bundles_raw or not test_bundles_raw:
        raise ValueError("Split manifest invalid bundle split: train_bundles and test_bundles must be non-empty")

    if any(not isinstance(profile, str) or not profile.strip() for profile in train_profiles_raw):
        raise ValueError("Split manifest invalid signer split: train_profiles entries must be non-empty strings")
    if any(not isinstance(profile, str) or not profile.strip() for profile in test_profiles_raw):
        raise ValueError("Split manifest invalid signer split: test_profiles entries must be non-empty strings")
    if any(not isinstance(bundle, str) or not bundle.strip() for bundle in train_bundles_raw):
        raise ValueError("Split manifest invalid bundle split: train_bundles entries must be non-empty strings")
    if any(not isinstance(bundle, str) or not bundle.strip() for bundle in test_bundles_raw):
        raise ValueError("Split manifest invalid bundle split: test_bundles entries must be non-empty strings")

    train_profiles = set(train_profiles_raw)
    test_profiles = set(test_profiles_raw)
    if train_profiles.intersection(test_profiles):
        raise ValueError("Split manifest signer leakage: train_profiles and test_profiles overlap")

    train_bundles = set(train_bundles_raw)
    test_bundles = set(test_bundles_raw)
    if train_bundles.intersection(test_bundles):
        raise ValueError("Split manifest bundle leakage: train_bundles and test_bundles overlap")


def _aggregate_trials(trials: list[dict[str, Any]]) -> dict[int, dict[str, float]]:
    by_shot: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for trial in trials:
        shot = trial.get("shot")
        if not isinstance(shot, int):
            raise ValueError("Trial record missing integer shot")
        by_shot[shot].append(trial)

    summary: dict[int, dict[str, float]] = {}
    for shot, shot_trials in by_shot.items():
        accuracies: list[float] = []
        f1_scores: list[float] = []
        for trial in shot_trials:
            metrics = trial.get("metrics")
            if not isinstance(metrics, dict):
                raise ValueError("Trial record missing metrics object")
            if "accuracy" not in metrics or "f1_score" not in metrics:
                raise ValueError("Trial metrics missing accuracy or f1_score")
            accuracies.append(float(metrics["accuracy"]))
            f1_scores.append(float(metrics["f1_score"]))

        accuracy_std = statistics.stdev(accuracies) if len(accuracies) > 1 else 0.0
        f1_std = statistics.stdev(f1_scores) if len(f1_scores) > 1 else 0.0
        summary[shot] = {
            "trial_count": float(len(shot_trials)),
            "mean_accuracy": statistics.mean(accuracies),
            "std_accuracy": accuracy_std,
            "mean_f1_score": statistics.mean(f1_scores),
            "std_f1_score": f1_std,
            "worst_seed_accuracy": min(accuracies),
        }
    return summary


def _select_best_trial(trials: list[dict[str, Any]]) -> dict[str, Any]:
    if not trials:
        raise ValueError("Cannot select best trial from empty results")

    ranked = sorted(
        trials,
        key=lambda trial: (
            float((trial.get("metrics") or {}).get("f1_score", 0)),
            float((trial.get("metrics") or {}).get("accuracy", 0)),
        ),
        reverse=True,
    )
    return ranked[0]


def _render_summary_markdown(summary: dict[str, Any]) -> str:
    aggregated_raw = summary.get("aggregated", {})
    aggregated: dict[int, dict[str, float]] = {}
    if isinstance(aggregated_raw, dict):
        for shot_raw, metrics in aggregated_raw.items():
            try:
                shot = int(shot_raw)
            except (TypeError, ValueError):
                continue
            if isinstance(metrics, dict):
                aggregated[shot] = {
                    "trial_count": float(metrics.get("trial_count", 0.0)),
                    "mean_accuracy": float(metrics.get("mean_accuracy", 0.0)),
                    "std_accuracy": float(metrics.get("std_accuracy", 0.0)),
                    "mean_f1_score": float(metrics.get("mean_f1_score", 0.0)),
                    "std_f1_score": float(metrics.get("std_f1_score", 0.0)),
                    "worst_seed_accuracy": float(metrics.get("worst_seed_accuracy", 0.0)),
                }

    diagnostics = summary.get("diagnostics") if isinstance(summary.get("diagnostics"), dict) else {}
    promotion = summary.get("promotion") if isinstance(summary.get("promotion"), dict) else {}
    best_trial = summary.get("best_trial") if isinstance(summary.get("best_trial"), dict) else {}
    best_metrics = best_trial.get("metrics") if isinstance(best_trial.get("metrics"), dict) else {}
    best_seed = best_trial.get("seed")
    best_shot = best_trial.get("shot")

    lines = [
        "# Few-shot runner summary",
        "",
        f"- Protocol: `{summary.get('protocol', 'few_shot_v1')}`",
        f"- Shots: `{','.join(str(value) for value in summary.get('shots', []))}`",
        f"- Seeds: `{','.join(str(value) for value in summary.get('seeds', []))}`",
        (
            "- Best trial: "
            f"seed={best_seed}, shot={best_shot}, "
            f"accuracy={float(best_metrics.get('accuracy', 0.0)):.4f}, "
            f"f1={float(best_metrics.get('f1_score', 0.0)):.4f}"
        ),
        (
            "- Promotion: "
            f"promoted={bool(promotion.get('promoted', False))}, "
            f"reason={promotion.get('reason', 'n/a')}"
        ),
        (
            "- Diagnostics: "
            f"fallback_metric_count={int(diagnostics.get('fallback_metric_count', 0))}"
        ),
        "",
        "## Aggregated metrics by shot",
        "",
        "| Shot | Trials | Mean accuracy | Std accuracy | Worst-seed accuracy | Mean F1 | Std F1 |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    for shot in sorted(aggregated.keys()):
        metrics = aggregated[shot]
        lines.append(
            "| "
            f"{shot} | "
            f"{int(metrics['trial_count'])} | "
            f"{metrics['mean_accuracy']:.4f} | "
            f"{metrics['std_accuracy']:.4f} | "
            f"{metrics['worst_seed_accuracy']:.4f} | "
            f"{metrics['mean_f1_score']:.4f} | "
            f"{metrics['std_f1_score']:.4f} |"
        )

    return "\n".join(lines) + "\n"


def _promote_best_model(best_trial: dict[str, Any], destination_dir: Path) -> dict[str, Any]:
    model_output_dir = best_trial.get("model_output_dir")
    if not isinstance(model_output_dir, str) or not model_output_dir:
        raise ValueError("Best trial is missing model_output_dir")

    source = Path(model_output_dir)
    if not source.exists():
        return {"promoted": False, "reason": "missing_model_output_dir", "source": str(source)}

    if destination_dir.exists():
        shutil.rmtree(destination_dir)
    destination_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination_dir)
    return {"promoted": True, "source": str(source), "destination": str(destination_dir)}


def _build_train_command(
    train_script: Path,
    manifest: Path,
    data_dir: Path,
    output_dir: Path,
    seed: int,
    skip_examples: bool,
) -> list[str]:
    command = [
        sys.executable,
        str(train_script),
        "--manifest",
        str(manifest),
        "--data-dir",
        str(data_dir),
        "--output-dir",
        str(output_dir),
        "--seed",
        str(seed),
    ]
    if skip_examples:
        command.append("--skip-examples")
    return command


def _extract_trial_metrics(report: dict[str, object]) -> tuple[float, float, bool]:
    try:
        accuracy, f1_score = _extract_score(report)
        return (accuracy, f1_score, False)
    except ValueError:
        global_metrics = report.get("global")
        if isinstance(global_metrics, dict):
            accuracy_raw = global_metrics.get("accuracy", 0.0)
            f1_raw = global_metrics.get("f1_score", accuracy_raw)
            try:
                return float(accuracy_raw), float(f1_raw), True
            except (TypeError, ValueError):
                pass
        return (0.0, 0.0, True)


def _load_global_model_artifact(
    model_output_dir: Path,
) -> tuple[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray], list[str]]:
    artifact_path = model_output_dir / "global" / "amy_model.npz"
    if not artifact_path.exists():
        raise ValueError(f"Missing trained model artifact for few-shot evaluation: {artifact_path}")

    with np.load(artifact_path) as artifact:
        labels = [str(label) for label in artifact["labels"].tolist()]
        weights = (
            artifact["w1"].T.astype(np.float32),
            artifact["b1"].astype(np.float32),
            artifact["w2"].T.astype(np.float32),
            artifact["b2"].astype(np.float32),
            artifact["w3"].T.astype(np.float32),
            artifact["b3"].astype(np.float32),
        )
    return weights, labels


def _build_heldout_test_samples(
    *,
    test_pool: list[dict[str, Any]],
    data_dir: Path,
) -> list[Any]:
    with tempfile.TemporaryDirectory(prefix="amy-fewshot-heldout-") as temp_dir:
        temp_manifest = Path(temp_dir) / "heldout_test_manifest.json"
        temp_manifest.write_text(json.dumps({"entries": test_pool}, indent=2), encoding="utf-8")
        original_data_dir = train_mlp_module.DATA_DIR
        train_mlp_module.DATA_DIR = data_dir
        try:
            test_samples, _ = build_samples_from_manifest(temp_manifest, skip_examples=True)
        finally:
            train_mlp_module.DATA_DIR = original_data_dir
    return test_samples


def _evaluate_heldout_test_pool(
    *,
    test_samples: list[Any],
    model_output_dir: Path,
) -> tuple[float, float, dict[str, int]]:
    model_weights, model_labels = _load_global_model_artifact(model_output_dir)
    model_label_set = set(model_labels)
    model_label_to_index = {label: index for index, label in enumerate(model_labels)}

    known_label_samples = [sample for sample in test_samples if sample.label in model_label_set]
    dropped_count = len(test_samples) - len(known_label_samples)
    if not known_label_samples:
        raise ValueError("Held-out test pool has no samples with labels known to the trained model")

    X_test, y_test, test_labels, _, _ = dataset_to_arrays(
        known_label_samples,
        augmentations_per_sample=0,
        use_multimodal=True,
    )
    if X_test.size == 0 or y_test.size == 0:
        raise ValueError("Held-out test pool could not be converted into evaluation arrays")

    y_remapped = np.array(
        [model_label_to_index[test_labels[int(label_index)]] for label_index in y_test],
        dtype=np.int64,
    )
    accuracy = _compute_accuracy(X_test, y_remapped, model_weights)
    f1_score = _compute_f1_score(X_test, y_remapped, model_weights, len(model_labels))
    diagnostics = {
        "total_test_samples": len(test_samples),
        "evaluated_test_samples": len(known_label_samples),
        "dropped_unknown_label_samples": dropped_count,
    }
    return accuracy, f1_score, diagnostics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--shots", default="1,3,5,10")
    parser.add_argument("--seeds", default="42,1337,2025")
    parser.add_argument("--test-profiles", default="")
    parser.add_argument("--test-profile-fraction", type=float, default=0.2)
    parser.add_argument("--skip-examples", action="store_true")
    parser.add_argument("--promote-best-model-dir", type=Path, default=None)
    args = parser.parse_args()

    shots = _parse_int_list(args.shots)
    seeds = _parse_int_list(args.seeds)
    explicit_test_profiles = [p.strip() for p in args.test_profiles.split(",") if p.strip()]

    if not shots:
        parser.error("--shots must include at least one integer")
    if not seeds:
        parser.error("--seeds must include at least one integer")
    if args.test_profile_fraction <= 0 or args.test_profile_fraction >= 1:
        parser.error("--test-profile-fraction must be > 0 and < 1")

    entries = _load_manifest_entries(args.manifest)
    profiles = sorted({_entry_profile(entry) for entry in entries})
    if len(profiles) < 2 and not explicit_test_profiles:
        parser.error("Few-shot runner requires at least 2 profiles unless --test-profiles is provided")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    train_script = Path(__file__).resolve().parent / "train_mlp.py"

    trial_results: list[dict[str, Any]] = []
    skipped_shots: list[dict[str, int | str]] = []
    fallback_metric_count = 0
    fallback_metric_trials: list[dict[str, int]] = []

    for seed in seeds:
        train_profiles, test_profiles = _partition_profiles(
            profiles=profiles,
            seed=seed,
            explicit_test_profiles=explicit_test_profiles,
            test_fraction=args.test_profile_fraction,
        )

        train_pool = [entry for entry in entries if _entry_profile(entry) in set(train_profiles)]
        test_pool = [entry for entry in entries if _entry_profile(entry) in set(test_profiles)]
        test_samples = _build_heldout_test_samples(test_pool=test_pool, data_dir=args.data_dir)

        for shot in shots:
            try:
                sampled_train_entries, train_samples_per_label = _sample_train_entries(
                    train_entries=train_pool,
                    shot=shot,
                    seed=seed + shot,
                )
            except ValueError:
                skipped_shots.append({"seed": seed, "shot": shot, "reason": "insufficient_samples"})
                continue

            split_manifest = {
                "protocol_version": 1,
                "seed": seed,
                "shot": shot,
                "train_profiles": train_profiles,
                "test_profiles": test_profiles,
                "train_bundles": sorted({_entry_bundle(entry) for entry in sampled_train_entries}),
                "test_bundles": sorted({_entry_bundle(entry) for entry in test_pool}),
                "labels": sorted({_entry_label(entry) for entry in sampled_train_entries}),
                "train_samples_per_label": train_samples_per_label,
                "test_samples_per_label": dict(
                    Counter(_entry_label(entry) for entry in test_pool)
                ),
            }
            _validate_split_manifest(split_manifest)

            split_manifest_path = args.output_dir / f"split_manifest_seed{seed}_shot{shot}.json"
            split_manifest_path.write_text(
                json.dumps(split_manifest, indent=2, sort_keys=True), encoding="utf-8"
            )

            train_manifest = {"entries": sampled_train_entries}
            train_manifest_path = args.output_dir / f"train_manifest_seed{seed}_shot{shot}.json"
            train_manifest_path.write_text(
                json.dumps(train_manifest, indent=2), encoding="utf-8"
            )

            run_output_dir = args.output_dir / f"models_seed{seed}_shot{shot}"
            command = _build_train_command(
                train_script=train_script,
                manifest=train_manifest_path,
                data_dir=args.data_dir,
                output_dir=run_output_dir,
                seed=seed,
                skip_examples=args.skip_examples,
            )
            run = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
                env=dict(os.environ),
            )
            if run.returncode != 0:
                raise RuntimeError(
                    "Few-shot run failed "
                    f"for seed={seed}, shot={shot}.\n"
                    f"command: {' '.join(command)}\n"
                    f"stdout:\n{run.stdout}\n"
                    f"stderr:\n{run.stderr}"
                )

            parsed_report = _parse_training_report(run.stdout)
            accuracy, f1_score, used_fallback_metrics = _extract_trial_metrics(parsed_report)
            heldout_accuracy, heldout_f1_score, heldout_diagnostics = _evaluate_heldout_test_pool(
                test_samples=test_samples,
                model_output_dir=run_output_dir,
            )
            if used_fallback_metrics:
                fallback_metric_count += 1
                fallback_metric_trials.append({"seed": seed, "shot": shot})
            report_path = args.output_dir / f"report_seed{seed}_shot{shot}.json"
            report_payload = {
                "seed": seed,
                "shot": shot,
                "metrics": {"accuracy": heldout_accuracy, "f1_score": heldout_f1_score},
                "training_metrics": {"accuracy": accuracy, "f1_score": f1_score},
                "used_fallback_metrics": used_fallback_metrics,
                "heldout_test_diagnostics": heldout_diagnostics,
                "model_output_dir": str(run_output_dir),
                "raw_report": parsed_report,
            }
            report_path.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")
            trial_results.append(report_payload)

    if not trial_results:
        raise ValueError(
            "Few-shot runner produced no valid trials. "
            "Try lower shot values or provide more labeled bundles."
        )

    promotion_result: dict[str, Any] = {"promoted": False, "reason": "promotion_not_requested"}
    best_trial = _select_best_trial(trial_results)
    if args.promote_best_model_dir is not None:
        promotion_result = _promote_best_model(best_trial, args.promote_best_model_dir)

    summary = {
        "protocol": "few_shot_v1",
        "shots": shots,
        "seeds": seeds,
        "results": trial_results,
        "aggregated": _aggregate_trials(trial_results),
        "best_trial": best_trial,
        "skipped_shots": skipped_shots,
        "promotion": promotion_result,
        "diagnostics": {
            "fallback_metric_count": fallback_metric_count,
            "fallback_metric_trials": fallback_metric_trials,
        },
        "global": {
            "accuracy": float((best_trial["metrics"])["accuracy"]),
            "f1_score": float((best_trial["metrics"])["f1_score"]),
        },
    }
    summary_path = args.output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    summary_markdown_path = args.output_dir / "summary.md"
    summary_markdown_path.write_text(_render_summary_markdown(summary), encoding="utf-8")
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
