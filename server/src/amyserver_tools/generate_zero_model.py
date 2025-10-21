#!/usr/bin/env python3
"""Generate a zero-initialized MLP model artifact."""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import numpy as np


def _ensure_label_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return []


def _ensure_counts_list(value: Any, length: int) -> list[float]:
    if isinstance(value, list) and len(value) == length:
        return [max(0.0, float(item) if isinstance(item, (int, float)) else 0.0) for item in value]
    return [0.0] * length


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: generate_zero_model.py <destination>", file=sys.stderr)
        return 2

    destination = sys.argv[1]
    destination_abs = os.path.realpath(destination)
    server_dir = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))
    allowed_roots = [os.path.join(server_dir, "data")]
    for env_key in ("AMY_ECHO_DATA_DIR", "AMY_DATA_DIR"):
        env_data_dir = os.environ.get(env_key)
        if env_data_dir:
            allowed_roots.append(os.path.realpath(env_data_dir))
    if not any(
        destination_abs == root or destination_abs.startswith(os.path.join(root, ""))
        for root in allowed_roots
    ):
        print(f"destination must be within server data directory: {destination}", file=sys.stderr)
        return 2

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive guard
        print(f"invalid JSON payload: {exc}", file=sys.stderr)
        return 1

    labels = _ensure_label_list(payload.get("labels"))
    counts = _ensure_counts_list(payload.get("counts"), len(labels))

    input_size = int(payload.get("inputSize", 126))
    hidden_size = int(payload.get("hiddenSize", 256))
    if input_size <= 0 or hidden_size <= 0:
        print(
            f"inputSize and hiddenSize must be positive (got {input_size}, {hidden_size})",
            file=sys.stderr,
        )
        return 1
    output_size = max(len(labels), 1)

    dtype = np.float32
    w1 = np.zeros((hidden_size, input_size), dtype=dtype)
    b1 = np.zeros((hidden_size,), dtype=dtype)
    w2 = np.zeros((output_size, hidden_size), dtype=dtype)
    b2 = np.zeros((output_size,), dtype=dtype)

    labels_arr = np.array(labels, dtype="<U64")
    counts_arr = np.array(counts, dtype=dtype)

    os.makedirs(os.path.dirname(destination) or ".", exist_ok=True)
    tmp_path = f"{destination}.tmp"
    with open(tmp_path, "wb") as handle:
        np.savez(handle, labels=labels_arr, counts=counts_arr, w1=w1, b1=b1, w2=w2, b2=b2)
    os.replace(tmp_path, destination)
    return 0


if __name__ == "__main__":  # pragma: no cover - script entry point
    raise SystemExit(main())
