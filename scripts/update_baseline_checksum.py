#!/usr/bin/env python3
"""Validate and update the checksum file for the global demo MLP bundle."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

BASELINE_MODEL_PATH = Path(__file__).resolve().parents[1] / "server" / "data" / "models" / "global" / "amy_model.npz"
CHECKSUM_PATH = BASELINE_MODEL_PATH.with_suffix(BASELINE_MODEL_PATH.suffix + ".sha256")
METADATA_PATH = BASELINE_MODEL_PATH.with_name("training_metadata.json")


def _load_metadata() -> dict[str, object]:
    if not METADATA_PATH.exists():
        raise FileNotFoundError(f"Training metadata missing: {METADATA_PATH}")
    payload = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise TypeError("training_metadata.json must contain a JSON object")
    labels = payload.get("labels")
    if not isinstance(labels, list) or not labels or not all(isinstance(label, str) and label.strip() for label in labels):
        raise ValueError("training_metadata.json must contain non-empty string labels")
    contract = payload.get("artifact_contract")
    if not isinstance(contract, dict):
        raise ValueError("training_metadata.json must contain artifact_contract")
    label_count = contract.get("label_count")
    if label_count != len(labels):
        raise ValueError(
            f"artifact_contract.label_count ({label_count}) must match labels length ({len(labels)})"
        )
    return payload


def main() -> None:
    if not BASELINE_MODEL_PATH.exists():
        raise FileNotFoundError(f"Global demo model missing: {BASELINE_MODEL_PATH}")

    _load_metadata()

    digest = hashlib.sha256(BASELINE_MODEL_PATH.read_bytes()).hexdigest()
    CHECKSUM_PATH.write_text(digest + "\n", encoding="utf-8")
    print(f"Updated checksum at {CHECKSUM_PATH}")


if __name__ == "__main__":
    main()
