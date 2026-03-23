#!/usr/bin/env python3
"""Run a lightweight hyperparameter sweep for train_mlp.py.

This keeps the useful orchestration idea from the legacy SignLanguageRecognition
`sweep.py` / `sweep_cv.py` scripts, but uses Amy's Echo training entrypoint and
artifact layout.
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
    training = report.get("training")
    if not isinstance(training, dict):
        return (0.0, 0.0)
    accuracy = float(training.get("accuracy", 0.0) or 0.0)
    f1_score = float(training.get("f1_score", 0.0) or 0.0)
    return (accuracy, f1_score)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--epochs", default="80,120")
    parser.add_argument("--learning-rates", default="0.001,0.003")
    parser.add_argument("--dropouts", default="0.2,0.3")
    parser.add_argument("--early-stopping", default="10")
    parser.add_argument("--trials", type=int, default=2)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--skip-examples", action="store_true")
    args = parser.parse_args()

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
        trial_scores: list[dict[str, float]] = []
        for trial in range(args.trials):
            seed = args.seed + (config_index * 1000) + trial
            with tempfile.TemporaryDirectory(prefix="amy-mlp-sweep-") as tmp_dir:
                output_dir = Path(tmp_dir) / "models"
                command = _build_command(
                    train_script=train_script,
                    manifest=args.manifest,
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
                        f"{config} (seed={seed}). stderr:\n{run.stderr}"
                    )
                report = _parse_training_report(run.stdout)
                accuracy, f1_score = _extract_score(report)
                trial_scores.append(
                    {"accuracy": accuracy, "f1_score": f1_score, "seed": float(seed)}
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
    print(json.dumps({"best": ranked[0], "results": ranked}, indent=2))


if __name__ == "__main__":
    main()
