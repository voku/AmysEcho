#!/usr/bin/env python3
"""Generate a zero-initialized 3-layer MLP model artifact for temporal multimodal recognition."""

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


def _is_destination_allowed(destination: str) -> bool:
    destination_abs = os.path.realpath(destination)
    server_dir = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))
    allowed_roots = [os.path.join(server_dir, "data")]
    for env_key in ("AMY_ECHO_DATA_DIR", "AMY_DATA_DIR"):
        env_data_dir = os.environ.get(env_key)
        if env_data_dir:
            allowed_roots.append(os.path.realpath(env_data_dir))
    return any(
        destination_abs == root or destination_abs.startswith(os.path.join(root, ""))
        for root in allowed_roots
    )


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: generate_zero_model.py <destination>", file=sys.stderr)
        return 2

    destination = sys.argv[1]
    if not _is_destination_allowed(destination):
        print(f"destination must be within server data directory: {destination}", file=sys.stderr)
        return 2

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive guard
        print(f"invalid JSON payload: {exc}", file=sys.stderr)
        return 1

    labels = _ensure_label_list(payload.get("labels"))
    counts = _ensure_counts_list(payload.get("counts"), len(labels))

    # Support both legacy 'hiddenSize' and new 'layer1Size'/'layer2Size'
    input_size = int(payload.get("inputSize", 48870))
    window_size = int(payload.get("windowSize", 30))
    feature_size = int(payload.get("featureSize", 1629))
    layer1_size = int(payload.get("layer1Size", payload.get("hiddenSize", 1024)))
    layer2_size = int(payload.get("layer2Size", 512))

    if input_size <= 0 or layer1_size <= 0 or layer2_size <= 0:
        print(
            f"inputSize and layer sizes must be positive (got {input_size}, {layer1_size}, {layer2_size})",
            file=sys.stderr,
        )
        return 1
    output_size = max(len(labels), 1)

    dtype = np.float32
    # Architecture: Input -> L1 -> L2 -> Output
    w1 = np.zeros((layer1_size, input_size), dtype=dtype)
    b1 = np.zeros((layer1_size,), dtype=dtype)
    w2 = np.zeros((layer2_size, layer1_size), dtype=dtype)
    b2 = np.zeros((layer2_size,), dtype=dtype)
    w3 = np.zeros((output_size, layer2_size), dtype=dtype)
    b3 = np.zeros((output_size,), dtype=dtype)

    labels_arr = np.array(labels, dtype="<U64")
    counts_arr = np.array(counts, dtype=dtype)

    os.makedirs(os.path.dirname(destination) or ".", exist_ok=True)
    tmp_path = f"{destination}.tmp"

    save_dict = {
        "labels": labels_arr,
        "counts": counts_arr,
        "w1": w1, "b1": b1,
        "w2": w2, "b2": b2,
        "w3": w3, "b3": b3,
        "arch": "mlp_3layer_window",
        "window_size": window_size,
        "input_dim": input_size,
        "feature_size": feature_size
    }

    with open(tmp_path, "wb") as handle:
        np.savez(handle, **save_dict)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp_path, destination)
    return 0


if __name__ == "__main__":  # pragma: no cover - script entry point
    raise SystemExit(main())
