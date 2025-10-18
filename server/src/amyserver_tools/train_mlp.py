#!/usr/bin/env python3

"""Train Amy's gesture MLP from bundle manifests.

The script looks at the training bundle manifest produced by the app uploads,
converts each bundle into a training sample, trains a simple MLP, and writes
updated weight files for the global as well as per-profile models. A structured
training report is printed to stdout so callers (the Express server) can relay
status back to the app.
"""

import argparse
import json
import logging
import math
import os
import sys
from dataclasses import dataclass, replace
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Union

import numpy as np

LOGGER = logging.getLogger("amyserver.train_mlp")
if not LOGGER.handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    LOGGER.addHandler(handler)
LOGGER.setLevel(logging.INFO)
LOGGER.propagate = False

try:  # Optional heavy dependencies – we degrade gracefully when absent
    import cv2  # type: ignore
    import mediapipe as mp  # type: ignore
except Exception:  # pragma: no cover - mediapipe not always available in CI
    cv2 = None
    mp = None

# --- Config -----------------------------------------------------------------

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DATA_DIR = Path(os.environ.get("MLP_DATA_DIR", DEFAULT_DATA_DIR))
MANIFEST_PATH = Path(
    os.environ.get(
        "MLP_MANIFEST_PATH",
        DATA_DIR / "datasets" / "training_manifest.json",
    )
)
MODELS_DIR = Path(os.environ.get("MLP_MODELS_DIR", DATA_DIR / "models"))
GLOBAL_MODEL_PATH = MODELS_DIR / "global" / "amy_model.npz"
CACHE_FILENAME = "landmarks_cached.json"
LEGACY_DATASET_PATH = Path(
    os.environ.get("MLP_DATASET_PATH", DATA_DIR / "dgs_samples.json")
)

HIDDEN_SIZE = int(os.environ.get("MLP_HIDDEN_SIZE", "128"))
LEARNING_RATE = float(os.environ.get("MLP_LEARNING_RATE", "0.01"))
EPOCHS = int(os.environ.get("MLP_EPOCHS", "500"))
MAX_FRAMES_PER_CLIP = int(os.environ.get("MLP_MAX_FRAMES", "120"))
FRAME_STRIDE = int(os.environ.get("MLP_FRAME_STRIDE", "2"))
DROPOUT_RATE = max(0.0, min(1.0, float(os.environ.get("MLP_DROPOUT_RATE", "0.0"))))
_ENV_PATIENCE = os.environ.get("MLP_EARLY_STOPPING_PATIENCE")
EARLY_STOPPING_PATIENCE: Optional[int] = None
if _ENV_PATIENCE:
    try:
        parsed = int(_ENV_PATIENCE)
        if parsed > 0:
            EARLY_STOPPING_PATIENCE = parsed
        else:
            LOGGER.warning(
                "MLP_EARLY_STOPPING_PATIENCE must be > 0, got '%s'. Disabling.",
                _ENV_PATIENCE,
            )
    except ValueError:
        LOGGER.warning(
            "MLP_EARLY_STOPPING_PATIENCE is not a valid integer: '%s'. Disabling.",
            _ENV_PATIENCE,
        )

_env_min_delta_str = os.environ.get("MLP_EARLY_STOPPING_MIN_DELTA", "0.0")
try:
    _parsed_min_delta = float(_env_min_delta_str)
except ValueError:
    LOGGER.warning(
        "MLP_EARLY_STOPPING_MIN_DELTA is not a valid float: '%s'. Using 0.0.",
        _env_min_delta_str,
    )
    _parsed_min_delta = 0.0
EARLY_STOPPING_MIN_DELTA = max(0.0, _parsed_min_delta)

LOSS_EPSILON = np.spacing(1.0)


WeightTuple = Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]

def _emit_event(payload: Dict[str, object]) -> None:
    """Log a structured progress event."""

    LOGGER.info(json.dumps(payload))

# --- Data structures --------------------------------------------------------

@dataclass
class Sample:
    """Training sample produced from a bundle."""

    label: str
    profile_id: Optional[str]
    landmarks: List[List[float]]  # 42 landmarks, each [x, y, z]


_UNSET = object()


@dataclass(frozen=True)
class TrainingConfig:
    """Configuration values that control the trainer's behaviour."""

    hidden_size: int = HIDDEN_SIZE
    epochs: int = EPOCHS
    learning_rate: float = LEARNING_RATE
    dropout_rate: float = DROPOUT_RATE
    early_stopping_patience: Optional[int] = EARLY_STOPPING_PATIENCE
    early_stopping_min_delta: float = EARLY_STOPPING_MIN_DELTA
    return_best_and_final: bool = False


@dataclass
class TrainingSnapshots:
    """Container for the best and terminal weights observed during training."""

    best_weights: WeightTuple
    final_weights: WeightTuple
    best_epoch: int
    final_epoch: int


# --- Helpers ----------------------------------------------------------------


def ensure_inside(base: Path, candidate: Path) -> Path:
    """Ensure candidate resolves within base directory."""

    resolved = candidate.resolve()
    if not str(resolved).startswith(str(base.resolve())):
        raise ValueError(f"Unsafe path outside data directory: {candidate}")
    return resolved


def load_json(path: Path) -> Optional[dict]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as err:
        print(f"warning: failed to parse JSON from {path}: {err}", file=sys.stderr)
        return None


def flatten_landmarks_mean(frames: List[dict]) -> Optional[List[List[float]]]:
    """Average landmarks across frames and return 42×3 list."""

    collected: List[np.ndarray] = []
    for frame in frames:
        coords = frame.get("landmarks")
        if not coords:
            continue
        arr = np.array(coords, dtype=np.float32).reshape(-1, 3)
        if arr.shape[0] < 42:
            padding = np.zeros((42 - arr.shape[0], 3), dtype=np.float32)
            arr = np.vstack([arr, padding])
        collected.append(arr[:42])
    if not collected:
        return None
    stacked = np.stack(collected, axis=0)
    averaged = stacked.mean(axis=0)
    return averaged.tolist()


def extract_landmarks_from_clip(clip_path: Path) -> List[dict]:
    """Run MediaPipe Hands on a clip and return frame landmark dictionaries."""

    if cv2 is None or mp is None:
        print(
            f"mediapipe/opencv unavailable; skipping clip extraction for {clip_path}",
            file=sys.stderr,
        )
        return []

    frames: List[dict] = []
    cap = cv2.VideoCapture(str(clip_path))
    if not cap.isOpened():
        print(f"warning: unable to open clip {clip_path}", file=sys.stderr)
        return frames

    with mp.solutions.hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.3,
    ) as hands:
        index = 0
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                break
            if index % FRAME_STRIDE != 0:
                index += 1
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = hands.process(rgb)

            left = np.zeros((21, 3), dtype=np.float32)
            right = np.zeros((21, 3), dtype=np.float32)

            if result.multi_hand_landmarks:
                for hand_idx, hand_landmarks in enumerate(result.multi_hand_landmarks):
                    coords = np.array(
                        [[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark],
                        dtype=np.float32,
                    )
                    label = None
                    if result.multi_handedness and len(result.multi_handedness) > hand_idx:
                        label = result.multi_handedness[hand_idx].classification[0].label
                    target = left if label and label.lower().startswith("left") else right
                    target[:] = coords
                    # if both hands are present but unlabeled, alternate
                    if label is None and hand_idx == 0:
                        left[:] = coords
                    elif label is None:
                        right[:] = coords

            combined = np.vstack([left, right])
            frames.append({"landmarks": combined.tolist()})
            index += 1
            if len(frames) >= MAX_FRAMES_PER_CLIP:
                break

    cap.release()
    return frames


def filter_samples_by_profile(samples: Iterable[Sample], profile_id: str) -> List[Sample]:
    """Return samples matching ``profile_id``.

    Example
    -------
    >>> s1 = Sample('hallo', 'p1', [[0.0, 0.0, 0.0]] * 42)
    >>> s2 = Sample('hallo', 'p2', [[0.1, 0.1, 0.1]] * 42)
    >>> filter_samples_by_profile([s1, s2], 'p1')
    [Sample(label='hallo', profile_id='p1', landmarks=[[0.0, 0.0, 0.0], ...])]
    """

    return [sample for sample in samples if sample.profile_id == profile_id]


def _normalize(lm):
    """Normalize one or two hands to be wrist-centered and scale-invariant."""
    if not lm or len(lm) < 21:
        return None

    if isinstance(lm[0], list) and len(lm[0]) == 3:
        pts = np.array(lm[:42])
    else:
        flat_lm = lm[:126] if len(lm) >= 126 else lm + [0.0] * (126 - len(lm))
        pts = np.array(flat_lm).reshape(42, 3)

    if len(pts) < 42:
        pad = np.zeros((42 - len(pts), 3))
        pts = np.vstack([pts, pad])

    def _norm_hand(hand: np.ndarray) -> np.ndarray:
        wrist = hand[0]
        hand = hand - wrist
        max_dist = np.max(np.sum(np.abs(hand), axis=1))
        if max_dist == 0:
            return hand
        hand /= max_dist
        return hand

    left = _norm_hand(pts[:21])
    right = _norm_hand(pts[21:]) if pts.shape[0] >= 42 else np.zeros_like(pts[:21])

    return np.concatenate([left, right]).flatten()


def augment_landmarks(
    normalized: Union[List[float], np.ndarray],
    *,
    rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None,
    jitter_std: float = 0.01,
    max_rotation_degrees: float = 10.0,
) -> np.ndarray:
    """Perturb normalized landmarks while keeping wrists centered and unit scale.

    Parameters
    ----------
    normalized:
        Flattened 42x3 landmark tensor produced by :func:`_normalize`.
    rng:
        Optional random number generator for deterministic tests.
    jitter_std:
        Standard deviation of per-point jitter applied to each coordinate (except
        the wrist anchor point for each hand).
    max_rotation_degrees:
        Maximum absolute in-plane rotation applied to both hands. Rotation keeps
        the wrists stationary and does not introduce additional translation or
        global scaling.

    Returns
    -------
    numpy.ndarray
        Augmented landmark tensor with the same shape as the input.
    """

    base = np.asarray(normalized, dtype=np.float32).reshape(42, 3)
    augmented = base.copy()

    if rng is None:
        rng = np.random.default_rng()

    def _rotate_xy(points: np.ndarray, radians: float) -> None:
        if abs(radians) < 1e-8:
            return
        cos_a = math.cos(radians)
        sin_a = math.sin(radians)
        rotation = np.array([[cos_a, -sin_a], [sin_a, cos_a]], dtype=np.float32)
        xy = points[:, :2].copy()
        points[:, :2] = xy @ rotation.T

    # Sample a shared rotation for both hands to maintain their relative layout.
    rotation_radians = math.radians(
        rng.uniform(-max_rotation_degrees, max_rotation_degrees)
    )

    for offset in (0, 21):
        hand = augmented[offset : offset + 21]
        base_hand = base[offset : offset + 21]
        if not np.any(base_hand):
            continue

        if jitter_std > 0.0:
            noise = rng.normal(0.0, jitter_std, size=hand.shape).astype(np.float32)
            noise[0] = 0.0  # Keep wrist anchor fixed
            hand += noise

        _rotate_xy(hand, rotation_radians)

        # Keep wrists exactly anchored and respect missing joints.
        hand[0] = np.zeros(3, dtype=np.float32)

        for idx in range(1, hand.shape[0]):
            orig = base_hand[idx]
            if not np.any(orig):
                hand[idx] = np.zeros(3, dtype=np.float32)
                continue

            target_norm = float(np.sum(np.abs(orig)))
            if target_norm == 0.0:
                hand[idx] = np.zeros(3, dtype=np.float32)
                continue

            current = hand[idx]
            current_norm = float(np.sum(np.abs(current)))
            if current_norm == 0.0:
                hand[idx] = orig.astype(np.float32)
                continue

            scale = target_norm / current_norm
            hand[idx] = (current * scale).astype(np.float32)

    return augmented.astype(np.float32).flatten()


# --- MLP implementation (unchanged core) ------------------------------------


def relu(x):
    return np.maximum(0, x)


def relu_derivative(x):
    return np.where(x > 0, 1, 0)


def softmax(x):
    e_x = np.exp(x - np.max(x, axis=1, keepdims=True))
    return e_x / np.sum(e_x, axis=1, keepdims=True)


def train_mlp(
    X,
    y,
    output_size,
    *,
    config: Optional[TrainingConfig] = None,
    hidden_size: Optional[int] = _UNSET,
    epochs: Optional[int] = _UNSET,
    learning_rate: Optional[float] = _UNSET,
    dropout_rate: Optional[float] = _UNSET,
    early_stopping_patience: Optional[int] = _UNSET,
    early_stopping_min_delta: Optional[float] = _UNSET,
    rng: Optional[Union[np.random.RandomState, np.random.Generator]] = None,
    return_best_and_final: Optional[bool] = _UNSET,
) -> Union[WeightTuple, TrainingSnapshots]:
    resolved = config or TrainingConfig()

    overrides = {
        field: value
        for field, value in {
            "hidden_size": hidden_size,
            "epochs": epochs,
            "learning_rate": learning_rate,
            "dropout_rate": dropout_rate,
            "early_stopping_patience": early_stopping_patience,
            "early_stopping_min_delta": early_stopping_min_delta,
            "return_best_and_final": return_best_and_final,
        }.items()
        if value is not _UNSET
    }
    if overrides:
        resolved = replace(resolved, **overrides)

    hidden_size = resolved.hidden_size
    epochs = resolved.epochs
    learning_rate = resolved.learning_rate
    dropout_rate = resolved.dropout_rate
    early_stopping_patience = resolved.early_stopping_patience
    early_stopping_min_delta = resolved.early_stopping_min_delta
    return_best_and_final_flag = resolved.return_best_and_final

    input_size = X.shape[1]

    random_source = np.random if rng is None else rng

    def _sample_from_rng(rs, shape, *, distribution: str) -> np.ndarray:
        """Generate samples from ``rs`` while handling Generator/RandomState APIs."""

        if distribution not in {"normal", "uniform"}:
            raise ValueError(
                f"Unsupported distribution '{distribution}'. Supported distributions are 'normal' and 'uniform'."
            )

        if isinstance(rs, (np.random.Generator, np.random.RandomState)):
            if distribution == "normal":
                return rs.standard_normal(size=shape)
            return rs.random(size=shape)
        if distribution == "normal":
            return np.random.standard_normal(size=shape)
        return np.random.random(size=shape)

    w1 = _sample_from_rng(random_source, (input_size, hidden_size), distribution="normal") * 0.01
    b1 = np.zeros(hidden_size)
    w2 = _sample_from_rng(random_source, (hidden_size, output_size), distribution="normal") * 0.01
    b2 = np.zeros(output_size)

    num_samples = X.shape[0]
    sanitized_dropout = max(0.0, min(1.0, dropout_rate))
    keep_prob = 1.0 - sanitized_dropout
    use_dropout = keep_prob < 1.0

    best_loss = math.inf
    best_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy())
    epochs_without_improvement = 0
    patience_enabled = (
        early_stopping_patience is not None and early_stopping_patience > 0
    )
    min_delta = max(0.0, early_stopping_min_delta)
    best_epoch = 0

    final_epoch = 0

    for epoch in range(epochs):
        current_epoch = epoch + 1
        z1 = np.dot(X, w1) + b1
        a1 = relu(z1)
        dropout_mask = None
        if use_dropout:
            dropout_mask = (
                _sample_from_rng(
                    random_source, (num_samples, hidden_size), distribution="uniform"
                )
                < keep_prob
            ).astype(
                a1.dtype
            )
            if keep_prob > 0.0:
                dropout_mask /= keep_prob
            a1 *= dropout_mask
        z2 = np.dot(a1, w2) + b2
        probs = softmax(z2)

        # Guard against log(0) or log(1) from floating-point underflow/overflow at extreme learning rates.
        p = np.clip(probs[np.arange(num_samples), y], LOSS_EPSILON, 1.0 - LOSS_EPSILON)
        log_probs = -np.log(p)
        loss = np.sum(log_probs) / num_samples
        if epoch % max(1, epochs // 10) == 0:
            _emit_event(
                {
                    "type": "progress",
                    "epoch": epoch + 1,
                    "total": epochs,
                    "loss": f"{loss:.4f}",
                }
            )

        stop_after_epoch = False

        if loss < best_loss - min_delta:
            best_loss = loss
            best_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy())
            best_epoch = current_epoch
            epochs_without_improvement = 0
        else:
            if patience_enabled:
                epochs_without_improvement += 1
                if epochs_without_improvement >= early_stopping_patience:
                    _emit_event(
                        {
                            "type": "early_stop",
                            "epoch": current_epoch,
                            "bestLoss": f"{best_loss:.4f}",
                            "bestEpoch": best_epoch,
                            "config": {
                                "patience": early_stopping_patience,
                                "minDelta": f"{min_delta:.6f}",
                            },
                        }
                    )
                    stop_after_epoch = True

        dz2 = probs
        dz2[np.arange(num_samples), y] -= 1
        dz2 /= num_samples

        dw2 = np.dot(a1.T, dz2)
        db2 = np.sum(dz2, axis=0)

        da1 = np.dot(dz2, w2.T)
        if dropout_mask is not None:
            da1 *= dropout_mask
        dz1 = da1 * relu_derivative(z1)

        dw1 = np.dot(X.T, dz1)
        db1 = np.sum(dz1, axis=0)

        w1 -= learning_rate * dw1
        b1 -= learning_rate * db1
        w2 -= learning_rate * dw2
        b2 -= learning_rate * db2

        final_epoch = current_epoch

        if stop_after_epoch:
            break

    final_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy())

    if return_best_and_final_flag:
        # Return both snapshots so callers can observe whether early stopping diverged from
        # the terminal epoch; they will be identical when the best loss occurs in the final pass.
        return TrainingSnapshots(
            best_weights=best_weights,
            final_weights=final_weights,
            best_epoch=best_epoch,
            final_epoch=final_epoch,
        )

    return best_weights


# --- Dataset loading --------------------------------------------------------


def build_samples_from_manifest(manifest_path: Path) -> Tuple[List[Sample], Dict[str, int]]:
    manifest = load_json(manifest_path)
    if not manifest:
        return [], {"entries": 0, "cache_hits": 0, "cache_misses": 0, "cache_writes": 0}

    entries = manifest.get("entries", [])
    data: List[Sample] = []
    cache_hits = 0
    cache_misses = 0
    cache_writes = 0

    for entry in entries:
        label = entry.get("label")
        if not label:
            continue
        profile_id = entry.get("profileId") or entry.get("metadata", {}).get("profileId")
        rel_dir = entry.get("storage", {}).get("directory")
        if not rel_dir:
            continue

        bundle_dir = ensure_inside(DATA_DIR, DATA_DIR / rel_dir)
        landmarks_path = bundle_dir / "landmarks.json"
        cache_path = bundle_dir / CACHE_FILENAME
        clip_path = bundle_dir / "clip.mp4"

        frames: Optional[List[dict]] = None

        cached = load_json(cache_path)
        if cached and isinstance(cached.get("frames"), list):
            frames = cached["frames"]
            cache_hits += 1
        else:
            source = load_json(landmarks_path)
            if source and isinstance(source.get("frames"), list):
                frames = source["frames"]
                cache_misses += 1
            elif clip_path.exists():
                frames = extract_landmarks_from_clip(clip_path)
                if frames:
                    cache_writes += 1
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    with cache_path.open("w", encoding="utf-8") as handle:
                        json.dump({"frames": frames}, handle, indent=2)
            else:
                cache_misses += 1

        if not frames:
            continue

        averaged = flatten_landmarks_mean(frames)
        if averaged is None:
            continue

        data.append(Sample(label=label, profile_id=profile_id, landmarks=averaged))

    stats = {
        "entries": len(entries),
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "cache_writes": cache_writes,
    }
    return data, stats


def build_samples_from_legacy_dataset(dataset_path: Path) -> List[Sample]:
    legacy = load_json(dataset_path)
    if not legacy:
        return []
    samples = []
    for entry in legacy.get("samples", []):
        label = entry.get("label") or entry.get("gestureDefinitionId")
        if not label:
            continue
        profile_id = entry.get("profileId")
        landmarks = entry.get("landmarks") or entry.get("landmarkData")
        if not landmarks:
            continue
        samples.append(Sample(label=label, profile_id=profile_id, landmarks=landmarks))
    return samples


def dataset_to_arrays(samples: List[Sample]) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    label_set = sorted({sample.label for sample in samples})
    label_to_idx = {label: idx for idx, label in enumerate(label_set)}

    X_list: List[np.ndarray] = []
    y_list: List[int] = []

    for sample in samples:
        normalized = _normalize(sample.landmarks)
        if normalized is None:
            continue
        X_list.append(np.array(normalized, dtype=np.float32))
        y_list.append(label_to_idx[sample.label])

    if not X_list:
        return np.zeros((0, 126), dtype=np.float32), np.zeros((0,), dtype=np.int64), label_set

    X = np.vstack(X_list)
    y = np.array(y_list, dtype=np.int64)
    return X, y, label_set


def save_model(path: Path, weights: Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray], labels: List[str]):
    w1, b1, w2, b2 = weights
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("wb") as handle:
        np.savez(
            handle,
            w1=np.array(w1.T, order="C"),
            b1=b1,
            w2=np.array(w2.T, order="C"),
            b2=b2,
            labels=np.array(labels),
        )
    os.replace(tmp_path, path)
    try:
        os.chmod(path, 0o640)
    except OSError:
        pass


def train_models(samples: List[Sample]) -> Tuple[Dict[str, dict], dict]:
    """Train global and per-profile models. Returns (profiles_report, global_report)."""

    global_report = {"samples": 0, "accuracy": 0.0, "labels": {}}
    profiles_report: Dict[str, dict] = {}

    if not samples:
        return profiles_report, global_report

    X, y, labels = dataset_to_arrays(samples)
    if X.shape[0] == 0:
        return profiles_report, global_report

    w1, b1, w2, b2 = train_mlp(X, y, len(labels))

    z1 = relu(np.dot(X, w1) + b1)
    z2 = np.dot(z1, w2) + b2
    probs = softmax(z2)
    preds = np.argmax(probs, axis=1)
    acc = float(np.mean(preds == y)) if len(y) else 0.0

    save_model(GLOBAL_MODEL_PATH, (w1, b1, w2, b2), labels)
    global_report = {
        "samples": int(X.shape[0]),
        "accuracy": acc,
        "labels": {label: int(sum(1 for sample in samples if sample.label == label)) for label in labels},
        "modelPath": os.path.relpath(GLOBAL_MODEL_PATH, DATA_DIR),
    }

    profiles = sorted({s.profile_id for s in samples if s.profile_id})
    for pid in profiles:
        subset = filter_samples_by_profile(samples, pid)
        if not subset:
            continue
        Xp, yp, labels_p = dataset_to_arrays(subset)
        if Xp.shape[0] == 0:
            continue
        wp1, bp1, wp2, bp2 = train_mlp(Xp, yp, len(labels_p))
        z1p = relu(np.dot(Xp, wp1) + bp1)
        z2p = np.dot(z1p, wp2) + bp2
        pro_p = softmax(z2p)
        preds_p = np.argmax(pro_p, axis=1)
        acc_p = float(np.mean(preds_p == yp)) if len(yp) else 0.0
        profile_path = MODELS_DIR / pid / "amy_model.npz"
        save_model(profile_path, (wp1, bp1, wp2, bp2), labels_p)
        profiles_report[pid] = {
            "samples": int(Xp.shape[0]),
            "accuracy": acc_p,
            "labels": {label: int(sum(1 for sample in subset if sample.label == label)) for label in labels_p},
            "modelPath": os.path.relpath(profile_path, DATA_DIR),
        }

    return profiles_report, global_report


# --- Entry point ------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="Train Amy's MLP from manifest bundles")
    parser.add_argument("--manifest", type=str, default=str(MANIFEST_PATH))
    parser.add_argument("--data-dir", type=str, default=str(DATA_DIR))
    args = parser.parse_args()

    manifest_path = ensure_inside(Path(args.data_dir), Path(args.manifest))

    samples, stats = build_samples_from_manifest(manifest_path)
    if not samples:
        legacy_samples = build_samples_from_legacy_dataset(LEGACY_DATASET_PATH)
        samples = legacy_samples
        stats["legacy_samples"] = len(legacy_samples)
    profiles_report, global_report = train_models(samples)

    report = {
        "generatedAt": datetime.utcnow().replace(tzinfo=None).isoformat() + "Z",
        "manifestPath": os.path.relpath(manifest_path, Path(args.data_dir)),
        "cache": stats,
        "global": global_report,
        "profiles": profiles_report,
        "totalSamples": len(samples),
    }

    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())

