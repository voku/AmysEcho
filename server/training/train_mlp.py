#!/usr/bin/env python3
"""
AmysEcho Temporal MLP Training Script
"""

import json
import logging
import os
import sys
from pathlib import Path

import numpy as np

# Add current directory to path
sys.path.append(os.path.dirname(__file__))

from config_constants import (
    DATA_DIR,
    GLOBAL_MODEL_PATH,
    MANIFEST_PATH,
    VALIDATION_FRACTION,
)
from data_pipeline import dataset_to_arrays, process_clip_to_samples
from mlp_architecture import TrainingConfig, compute_accuracy, train_mlp
from model_serialization import save_model

LOGGER = logging.getLogger("amyserver.train_mlp_temporal")
logging.basicConfig(level=logging.INFO)

def load_json(path: Path) -> dict | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None

def main():
    # 1. Load Manifest
    manifest_path = MANIFEST_PATH
    if not manifest_path.exists():
        LOGGER.warning(f"Manifest not found: {manifest_path}. Proceeding with other data sources.")

    all_samples = []

    # 2. Process Clips from Manifest
    if manifest_path.exists():
        manifest = load_json(manifest_path)
        if manifest:
            entries = manifest.get("entries", [])
            LOGGER.info(f"Processing {len(entries)} entries from manifest...")
            for entry in entries:
                label = entry.get("label")
                rel_dir = entry.get("storage", {}).get("directory")
                if not label or not rel_dir:
                    continue

                bundle_dir = DATA_DIR / rel_dir
                if not bundle_dir.exists():
                     # Try relative to manifest if DATA_DIR doesn't work
                     bundle_dir = manifest_path.parent.parent / rel_dir

                # Try to find landmarks.json
                landmarks_path = bundle_dir / "landmarks.json"
                if not landmarks_path.exists():
                    # Try cache
                    landmarks_path = bundle_dir / "landmarks_cached.json"

                source = load_json(landmarks_path)
                if source and isinstance(source.get("frames"), list):
                    frames = source["frames"]
                    context = {
                        "profile_id": entry.get("profileId"),
                        "hand_focus": entry.get("metadata", {}).get("handFocus")
                    }
                    samples = process_clip_to_samples(frames, label, context)
                    all_samples.extend(samples)

    # 2.5 Process default video examples (global)
    video_examples_dir = DATA_DIR / "dgs_video_examples"
    if not video_examples_dir.exists():
        # Fallback to server/data
        video_examples_dir = Path(__file__).resolve().parents[1] / "data" / "dgs_video_examples"

    if video_examples_dir.exists():
        LOGGER.info(f"Processing video examples from {video_examples_dir}...")
        for landmarks_file in video_examples_dir.glob("*_landmarks.json"):
            label = landmarks_file.stem.replace("_landmarks", "")
            source = load_json(landmarks_file)
            if source and isinstance(source.get("frames"), list):
                frames = source["frames"]
                samples = process_clip_to_samples(frames, label, {})
                all_samples.extend(samples)

    if not all_samples:
        LOGGER.error("No samples found to train on.")
        return

    LOGGER.info(f"Generated {len(all_samples)} samples (temporal windows).")

    # 3. Prepare Arrays
    X, y, labels, weights = dataset_to_arrays(all_samples)

    # 4. Train/Val Split
    num_samples = X.shape[0]
    indices = np.random.permutation(num_samples)
    val_size = int(num_samples * VALIDATION_FRACTION)
    train_idx, val_idx = indices[val_size:], indices[:val_size]

    X_train, y_train = X[train_idx], y[train_idx]
    X_val, y_val = X[val_idx], y[val_idx]

    LOGGER.info(f"Training on {X_train.shape[0]} samples, validating on {X_val.shape[0]} samples.")

    # 5. Train Model
    config = TrainingConfig()
    trained_weights = train_mlp(
        X_train, y_train,
        output_size=len(labels),
        config=config,
        validation_data=(X_val, y_val)
    )

    # 6. Evaluate
    train_acc = compute_accuracy(X_train, y_train, trained_weights)
    val_acc = compute_accuracy(X_val, y_val, trained_weights)

    LOGGER.info(f"Final Training Accuracy: {train_acc:.2%}")
    LOGGER.info(f"Final Validation Accuracy: {val_acc:.2%}")

    # 7. Save Model
    save_model(GLOBAL_MODEL_PATH, trained_weights, labels, metadata={
        "train_acc": train_acc,
        "val_acc": val_acc
    })

    LOGGER.info(f"Model saved to {GLOBAL_MODEL_PATH}")

if __name__ == "__main__":
    # We need to define some constants that were missing in config_constants but used here
    # Actually, let's update config_constants with default paths if they are not there.
    main()
