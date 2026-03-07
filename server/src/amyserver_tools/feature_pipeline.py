from __future__ import annotations

import importlib
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

try:
    config_constants = importlib.import_module("config_constants")
except ModuleNotFoundError as exc:
    if exc.name != "config_constants":
        raise
    training_dir = Path(__file__).resolve().parents[2] / "training"
    if str(training_dir) not in sys.path:
        sys.path.append(str(training_dir))
    config_constants = importlib.import_module("config_constants")

MAX_AVG_FRAME_DELTA_MS = config_constants.MAX_AVG_FRAME_DELTA_MS
MIN_AVG_FRAME_DELTA_MS = config_constants.MIN_AVG_FRAME_DELTA_MS
MIN_USABLE_FRAME_RATIO = config_constants.MIN_USABLE_FRAME_RATIO


@dataclass(frozen=True)
class TemporalAugmentationConfig:
    frame_drop_ratio: float = 0.08
    speed_perturbation: float = 0.1
    time_warp_strength: float = 0.05
    landmark_jitter_std: float = 0.008


QUALITY_BOUNDED_CONFIG = TemporalAugmentationConfig(
    frame_drop_ratio=min(0.15, max(0.02, (1.0 - MIN_USABLE_FRAME_RATIO) * 0.25)),
    speed_perturbation=min(
        0.2,
        max(
            0.05,
            (MAX_AVG_FRAME_DELTA_MS - MIN_AVG_FRAME_DELTA_MS)
            / max(MAX_AVG_FRAME_DELTA_MS, 1.0)
            * 0.1,
        ),
    ),
    time_warp_strength=0.05,
    landmark_jitter_std=0.008,
)


def _resample_window(window: np.ndarray, target_frames: int) -> np.ndarray:
    if window.ndim != 2:
        raise ValueError("window must be shape (frames, features)")
    if window.shape[0] == 0:
        raise ValueError("window must include at least one frame")
    if target_frames < 1:
        raise ValueError("target_frames must be >= 1")
    if target_frames == 1:
        return window[:1].astype(np.float32, copy=True)

    src_idx = np.linspace(0, window.shape[0] - 1, num=window.shape[0], dtype=np.float32)
    dst_idx = np.linspace(0, window.shape[0] - 1, num=target_frames, dtype=np.float32)
    out = np.empty((target_frames, window.shape[1]), dtype=np.float32)
    for col in range(window.shape[1]):
        out[:, col] = np.interp(dst_idx, src_idx, window[:, col]).astype(np.float32)
    return out


def _restore_len(window: np.ndarray, target_len: int) -> np.ndarray:
    if window.shape[0] == target_len:
        return window
    return _resample_window(window, target_len)


def augment_temporal_window(
    window: np.ndarray,
    *,
    rng: np.random.Generator | np.random.RandomState | None = None,
    mirror_safe: bool = False,
    config: TemporalAugmentationConfig = QUALITY_BOUNDED_CONFIG,
) -> tuple[np.ndarray, dict[str, float | bool]]:
    if window.ndim != 2:
        raise ValueError("window must be shape (frames, features)")

    rand = rng if rng is not None else np.random.default_rng()
    frames, _ = window.shape
    augmented = window.astype(np.float32, copy=True)
    provenance: dict[str, float | bool] = {
        "frame_drop_ratio": 0.0,
        "speed_factor": 1.0,
        "time_warp": 0.0,
        "landmark_jitter_std": 0.0,
        "mirrored": False,
    }

    max_drop = max(1, int(frames * config.frame_drop_ratio))
    drop_count = (
        int(rand.integers(0, max_drop + 1))
        if hasattr(rand, "integers")
        else int(rand.randint(0, max_drop + 1))
    )
    min_kept = max(int(np.ceil(frames * MIN_USABLE_FRAME_RATIO)), 2)
    if drop_count > 0 and frames - drop_count >= min_kept:
        keep = np.sort(rand.choice(np.arange(frames), size=frames - drop_count, replace=False))
        augmented = augmented[keep]
        provenance["frame_drop_ratio"] = float(drop_count / frames)

    speed_delta = (
        rand.uniform(-1.0, 1.0) if hasattr(rand, "uniform") else (rand.rand() * 2.0 - 1.0)
    ) * config.speed_perturbation
    speed_factor = float(np.clip(1.0 + speed_delta, 0.8, 1.2))
    target_frames = max(2, round(augmented.shape[0] / speed_factor))
    augmented = _resample_window(augmented, target_frames)
    provenance["speed_factor"] = speed_factor

    warp = (
        rand.uniform(-1.0, 1.0) if hasattr(rand, "uniform") else (rand.rand() * 2.0 - 1.0)
    ) * config.time_warp_strength
    warp_scale = np.linspace(0.0, 1.0, num=augmented.shape[0], dtype=np.float32)
    warped_idx = np.clip(
        (warp_scale + (warp * (warp_scale - 0.5) ** 2)) * (augmented.shape[0] - 1),
        0,
        augmented.shape[0] - 1,
    )
    src_idx = np.arange(augmented.shape[0], dtype=np.float32)
    warped = np.empty_like(augmented)
    for col in range(augmented.shape[1]):
        warped[:, col] = np.interp(warped_idx, src_idx, augmented[:, col]).astype(np.float32)
    augmented = warped
    provenance["time_warp"] = float(warp)

    jitter = rand.normal(0.0, config.landmark_jitter_std, size=augmented.shape).astype(np.float32)
    jitter = np.clip(jitter, -0.03, 0.03)
    augmented = augmented + jitter
    provenance["landmark_jitter_std"] = float(np.std(jitter))

    if mirror_safe and (rand.uniform(0.0, 1.0) if hasattr(rand, "uniform") else rand.rand()) < 0.5:
        augmented[:, 0::3] *= -1.0
        provenance["mirrored"] = True

    augmented = _restore_len(augmented, frames)
    return augmented.astype(np.float32), provenance
