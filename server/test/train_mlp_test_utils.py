"""Shared helpers for focused MLP training pipeline tests."""

from __future__ import annotations

import numpy as np
import pytest

from amyserver_tools import train_mlp as module


def small_arch(monkeypatch: pytest.MonkeyPatch, *, feature_size: int = 4, window_size: int = 1) -> None:
    monkeypatch.setattr(module, "WINDOW_SIZE", window_size)
    monkeypatch.setattr(module, "INPUT_FEATURE_SIZE", feature_size)
    monkeypatch.setattr(module, "WINDOW_FEATURE_SIZE", feature_size * window_size)
    monkeypatch.setattr(module, "MLP_LAYER1_SIZE", 8)
    monkeypatch.setattr(module, "MLP_LAYER2_SIZE", 4)


def sample(
    label: str,
    values: list[float],
    *,
    profile_id: str | None = None,
    bundle: str | None = None,
    mirror_safe: bool = False,
    quality_weight: float = 1.0,
) -> module.Sample:
    return module.Sample(
        label=label,
        profile_id=profile_id,
        landmarks=values,
        quality_weight=quality_weight,
        mirror_safe=mirror_safe,
        source_bundle_id=bundle,
    )


def loss(weights: module.WeightTuple, X: np.ndarray, y: np.ndarray) -> float:
    probs, *_ = module._forward_mlp(X, *weights)
    return module._cross_entropy_from_probs(probs, y)
