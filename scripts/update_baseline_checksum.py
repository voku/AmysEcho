#!/usr/bin/env python3
"""Update the checksum file for the global baseline MLP artifact."""

from __future__ import annotations

import hashlib
from pathlib import Path

BASELINE_MODEL_PATH = Path(__file__).resolve().parents[1] / "server" / "data" / "models" / "global" / "amy_model.npz"
CHECKSUM_PATH = BASELINE_MODEL_PATH.with_suffix(BASELINE_MODEL_PATH.suffix + ".sha256")


def main() -> None:
    if not BASELINE_MODEL_PATH.exists():
        raise FileNotFoundError(f"Baseline model missing: {BASELINE_MODEL_PATH}")

    digest = hashlib.sha256(BASELINE_MODEL_PATH.read_bytes()).hexdigest()
    CHECKSUM_PATH.write_text(digest + "\n", encoding="utf-8")
    print(f"✅ Updated checksum at {CHECKSUM_PATH}")


if __name__ == "__main__":
    main()
