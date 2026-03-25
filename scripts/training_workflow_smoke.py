#!/usr/bin/env python3
"""Smoke workflow for DGS training integration.

Runs a lightweight end-to-end cycle using repository landmark videos:
1) realistic training cycle (small config),
2) generated model artifact checks,
3) sweep-tool execution against the generated train manifest.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REALISTIC_SCRIPT = PROJECT_ROOT / "scripts" / "realistic_dgs_training_cycle.py"
SWEEP_SCRIPT = PROJECT_ROOT / "server" / "src" / "amyserver_tools" / "train_mlp_sweep.py"


def run_command(command: list[str]) -> str:
    result = subprocess.run(
        command,
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(command)}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
    return result.stdout


def parse_json_output(raw: str) -> dict[str, object]:
    return json.loads(raw)


def normalize_loaded_labels(raw_labels: object) -> list[str]:
    if isinstance(raw_labels, np.ndarray):
        values = raw_labels.tolist()
    elif isinstance(raw_labels, list):
        values = raw_labels
    else:
        raise RuntimeError(f"Model labels have unsupported type: {type(raw_labels)}")

    normalized: list[str] = []
    for value in values:
        if isinstance(value, bytes):
            normalized.append(value.decode("utf-8"))
        else:
            normalized.append(str(value))
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report-path",
        type=Path,
        default=None,
    )
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--max-files-per-label", type=int, default=2)
    parser.add_argument("--holdout-ratio", type=float, default=0.5)
    args = parser.parse_args()
    report_path = (
        args.report_path
        if args.report_path is not None
        else Path(tempfile.gettempdir())
        / f"training_workflow_smoke_report_{int(time.time() * 1000)}.json"
    )

    realistic_command = [
        sys.executable,
        str(REALISTIC_SCRIPT),
        "--workflow-preset",
        "none",
        "--attempts",
        "1",
        "--epoch-schedule",
        str(args.epochs),
        "--max-files-per-label",
        str(args.max_files_per_label),
        "--holdout-ratio",
        str(args.holdout_ratio),
        "--timeout-seconds",
        "600",
        "--keep-attempt-artifacts",
        "--report-path",
        str(report_path),
    ]
    realistic_stdout = run_command(realistic_command)
    realistic_summary = parse_json_output(realistic_stdout)

    report = json.loads(report_path.read_text(encoding="utf-8"))
    model_rel = report["bestAttempt"]["evaluation"]["model_path"]
    model_path = PROJECT_ROOT / str(model_rel)
    metadata_path = model_path.parent / "training_metadata.json"
    manifest_path = model_path.parents[2] / "train_manifest.json"

    if not model_path.exists():
        raise RuntimeError(f"Generated model missing: {model_path}")
    if not metadata_path.exists():
        raise RuntimeError(f"Generated training metadata missing: {metadata_path}")
    if not manifest_path.exists():
        raise RuntimeError(f"Generated train manifest missing: {manifest_path}")

    required_keys = {"w1", "b1", "w2", "b2", "w3", "b3", "labels"}
    with np.load(model_path, allow_pickle=False) as model_data:
        if not required_keys.issubset(set(model_data.files)):
            raise RuntimeError(f"Generated model missing required keys: {required_keys - set(model_data.files)}")

        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        labels = metadata.get("labels", [])
        label_count = metadata.get("artifact_contract", {}).get("label_count")
        if not isinstance(labels, list) or not labels:
            raise RuntimeError("Generated metadata has no labels list")
        if label_count != len(labels):
            raise RuntimeError(
                f"label_count mismatch in metadata: contract={label_count}, labels={len(labels)}"
            )
        loaded_labels = normalize_loaded_labels(model_data["labels"])
        if loaded_labels != labels:
            raise RuntimeError(
                "model labels mismatch between npz and metadata: "
                f"npz={loaded_labels}, metadata={labels}"
            )

    sweep_command = [
        sys.executable,
        str(SWEEP_SCRIPT),
        "--manifest",
        str(manifest_path),
        "--data-dir",
        str(PROJECT_ROOT / "server" / "data"),
        "--epochs",
        str(args.epochs),
        "--learning-rates",
        "0.003",
        "--dropouts",
        "0.2",
        "--early-stopping",
        "5",
        "--trials",
        "1",
        "--skip-examples",
    ]
    sweep_stdout = run_command(sweep_command)
    sweep_summary = parse_json_output(sweep_stdout)
    if "best" not in sweep_summary or "results" not in sweep_summary:
        raise RuntimeError("Sweep output missing expected keys: best/results")

    output = {
        "status": "ok",
        "realisticSummary": realistic_summary,
        "reportPath": str(report_path),
        "modelPath": str(model_path),
        "trainManifestPath": str(manifest_path),
        "labelsCount": len(labels),
        "contractLabelCount": label_count,
        "sweepBest": sweep_summary["best"],
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
