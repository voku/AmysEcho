#!/usr/bin/env python3
"""Run a lightweight hyperparameter sweep for train_mlp.py.

Uses Amy's Echo training entrypoint and artifact layout.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from statistics import mean

try:
    from amyserver_tools.train_mlp import load_json, validate_manifest_signer_split
except ModuleNotFoundError:
    PACKAGE_ROOT = Path(__file__).resolve().parent.parent
    if str(PACKAGE_ROOT) not in sys.path:
        sys.path.insert(0, str(PACKAGE_ROOT))
    from amyserver_tools.train_mlp import load_json, validate_manifest_signer_split


@dataclass(frozen=True)
class SweepConfig:
    epochs: int
    learning_rate: float
    dropout: float
    early_stopping: int


def _parse_int_list(raw: str) -> list[int]:
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return [int(value) for value in values]


def _parse_float_list(raw: str) -> list[float]:
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return [float(value) for value in values]


def _resolve_train_script() -> Path:
    return Path(__file__).resolve().parent / "train_mlp.py"


def _build_command(
    train_script: Path,
    manifest: Path,
    data_dir: Path,
    output_dir: Path,
    config: SweepConfig,
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
        "--epochs",
        str(config.epochs),
        "--lr",
        str(config.learning_rate),
        "--dropout",
        str(config.dropout),
        "--early-stopping",
        str(config.early_stopping),
        "--seed",
        str(seed),
    ]
    if skip_examples:
        command.append("--skip-examples")
    return command


def _parse_training_report(stdout: str) -> dict[str, object]:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        if not line.startswith("{"):
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("No JSON training report found in train_mlp output")


def _extract_score(report: dict[str, object]) -> tuple[float, float]:
    global_metrics = report.get("global")
    if not isinstance(global_metrics, dict):
        global_metrics = report.get("training")
    if not isinstance(global_metrics, dict):
        raise ValueError("Sweep report missing metrics section: expected 'global' or 'training'")

    if "accuracy" not in global_metrics:
        raise ValueError("Sweep report missing required metric: accuracy")
    if "f1_score" not in global_metrics:
        raise ValueError("Sweep report missing required metric: f1_score")

    try:
        accuracy = float(global_metrics["accuracy"])
    except (TypeError, ValueError) as error:
        raise ValueError(
            f"Sweep report has invalid accuracy value: {global_metrics['accuracy']}"
        ) from error
    try:
        f1_score = float(global_metrics["f1_score"])
    except (TypeError, ValueError) as error:
        raise ValueError(
            f"Sweep report has invalid f1_score value: {global_metrics['f1_score']}"
        ) from error
    return (accuracy, f1_score)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-manifest", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument(
        "--heldout-manifest",
        type=Path,
        required=True,
        help="Heldout test manifest used to hard-gate signer leakage.",
    )
    parser.add_argument("--epochs", default="80,120")
    parser.add_argument("--learning-rates", default="0.001,0.003")
    parser.add_argument("--dropouts", default="0.2,0.3")
    parser.add_argument("--early-stopping", default="10")
    parser.add_argument("--trials", type=int, default=2)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--skip-examples", action="store_true")
    args = parser.parse_args()
    if args.trials < 1:
        parser.error("--trials must be >= 1")

    train_manifest_payload = load_json(args.train_manifest)
    heldout_manifest_payload = load_json(args.heldout_manifest)
    if not isinstance(train_manifest_payload, dict):
        raise ValueError(f"Could not read training manifest: {args.train_manifest}")
    if not isinstance(heldout_manifest_payload, dict):
        raise ValueError(f"Could not read heldout manifest: {args.heldout_manifest}")
    signer_split_validation = validate_manifest_signer_split(
        train_manifest=train_manifest_payload,
        test_manifest=heldout_manifest_payload,
    )

    train_script = _resolve_train_script()
    epochs_values = _parse_int_list(args.epochs)
    learning_rates = _parse_float_list(args.learning_rates)
    dropouts = _parse_float_list(args.dropouts)
    early_stopping_values = _parse_int_list(args.early_stopping)

    sweep_configs: list[SweepConfig] = []
    for epochs in epochs_values:
        for learning_rate in learning_rates:
            for dropout in dropouts:
                for early_stopping in early_stopping_values:
                    sweep_configs.append(
                        SweepConfig(
                            epochs=epochs,
                            learning_rate=learning_rate,
                            dropout=dropout,
                            early_stopping=early_stopping,
                        )
                    )

    if not sweep_configs:
        raise ValueError("No sweep configurations generated")

    results: list[dict[str, object]] = []

    for config_index, config in enumerate(sweep_configs):
        trial_scores: list[dict[str, float | int]] = []
        for trial in range(args.trials):
            seed = args.seed + (config_index * 1000) + trial
            with tempfile.TemporaryDirectory(prefix="amy-mlp-sweep-") as tmp_dir:
                output_dir = Path(tmp_dir) / "models"
                command = _build_command(
                    train_script=train_script,
                    manifest=args.train_manifest,
                    data_dir=args.data_dir,
                    output_dir=output_dir,
                    config=config,
                    seed=seed,
                    skip_examples=args.skip_examples,
                )
                env = dict(os.environ)
                run = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    check=False,
                    env=env,
                )
                if run.returncode != 0:
                    raise RuntimeError(
                        "Sweep run failed for config "
                        f"{config} (seed={seed}).\n"
                        f"command: {' '.join(command)}\n"
                        f"stdout:\n{run.stdout}\n"
                        f"stderr:\n{run.stderr}"
                    )
                report = _parse_training_report(run.stdout)
                accuracy, f1_score = _extract_score(report)
                trial_scores.append(
                    {"accuracy": accuracy, "f1_score": f1_score, "seed": seed}
                )

        result = {
            "config": {
                "epochs": config.epochs,
                "learning_rate": config.learning_rate,
                "dropout": config.dropout,
                "early_stopping": config.early_stopping,
            },
            "trial_count": len(trial_scores),
            "mean_accuracy": mean(score["accuracy"] for score in trial_scores),
            "mean_f1_score": mean(score["f1_score"] for score in trial_scores),
            "trials": trial_scores,
        }
        results.append(result)

    ranked = sorted(
        results,
        key=lambda item: (item["mean_f1_score"], item["mean_accuracy"]),
        reverse=True,
    )
    payload: dict[str, object] = {"best": ranked[0], "results": ranked}
    payload["signer_split_validation"] = signer_split_validation
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
