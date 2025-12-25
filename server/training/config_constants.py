#!/usr/bin/env python3
"""
Configuration Constants for AmysEcho Temporal Sliding Window Pipeline
"""

import os

from pathlib import Path

# ============================================================================
# PATH CONFIGURATION
# ============================================================================

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DATA_DIR = Path(os.environ.get("MLP_DATA_DIR", DEFAULT_DATA_DIR))
MANIFEST_PATH = Path(
    os.environ.get(
        "MLP_MANIFEST_PATH",
        DATA_DIR / "datasets" / "training_manifest.json",
    )
)
if not MANIFEST_PATH.exists():
    # Fallback to root data dir if server/data doesn't have it
    ROOT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
    MANIFEST_PATH = ROOT_DATA_DIR / "datasets" / "training_manifest.json"

MODELS_DIR = Path(os.environ.get("MLP_MODELS_DIR", DATA_DIR / "models"))
GLOBAL_MODEL_PATH = MODELS_DIR / "global" / "amy_model.npz"

# ============================================================================
# TEMPORAL WINDOW CONFIGURATION
# ============================================================================

# Number of consecutive frames per training sample
# Why 30? Sign language gestures typically last 0.5-2 seconds
# At 30fps: 30 frames = 1 second (captures complete gesture)
WINDOW_SIZE = int(os.environ.get("MLP_WINDOW_SIZE", "30"))

# Input feature size per frame (multimodal)
INPUT_FEATURE_SIZE = 1629  # 126 (Hands) + 99 (Pose) + 1404 (Face)

# Total feature size per training sample (temporal window flattened)
WINDOW_FEATURE_SIZE = INPUT_FEATURE_SIZE * WINDOW_SIZE  # 48,870 features

# Window stride for overlapping samples
# Stride=1 means maximum overlap (generates most training samples)
WINDOW_STRIDE = int(os.environ.get("MLP_WINDOW_STRIDE", "1"))

# ============================================================================
# MLP ARCHITECTURE - 3-LAYER FUNNEL
# ============================================================================

MLP_LAYER1_SIZE = int(os.environ.get("MLP_LAYER1_SIZE", "1024"))
MLP_LAYER2_SIZE = int(os.environ.get("MLP_LAYER2_SIZE", "512"))

# ============================================================================
# MODALITY PRIORITY WEIGHTING
# ============================================================================

HAND_PRIORITY_FACTOR = float(os.environ.get("MLP_HAND_PRIORITY", "3.0"))
POSE_PRIORITY_FACTOR = float(os.environ.get("MLP_POSE_PRIORITY", "0.4"))
FACE_PRIORITY_FACTOR = float(os.environ.get("MLP_FACE_PRIORITY", "0.1"))

# ============================================================================
# TRAINING HYPERPARAMETERS
# ============================================================================

LEARNING_RATE = float(os.environ.get("MLP_LEARNING_RATE", "0.005"))
EPOCHS = int(os.environ.get("MLP_EPOCHS", "1000"))
DROPOUT_RATE = max(0.0, min(1.0, float(os.environ.get("MLP_DROPOUT_RATE", "0.3"))))

# Validation split
VALIDATION_FRACTION = float(os.environ.get("MLP_VALIDATION_FRACTION", "0.15"))

# Early stopping
_ENV_PATIENCE = os.environ.get("MLP_EARLY_STOPPING_PATIENCE", "10")
try:
    EARLY_STOPPING_PATIENCE = int(_ENV_PATIENCE) if _ENV_PATIENCE else None
except ValueError:
    EARLY_STOPPING_PATIENCE = None

EARLY_STOPPING_MIN_DELTA = float(os.environ.get("MLP_EARLY_STOPPING_MIN_DELTA", "0.001"))

# ============================================================================
# SPECIAL CLASS LABELS
# ============================================================================

NULL_CLASS_LABEL = "_NULL_"
NULL_SAMPLES_PER_CLIP = 2  # Limit to prevent class imbalance

# ============================================================================
# MODEL SERIALIZATION
# ============================================================================

MODEL_ARCHITECTURE = "mlp_3layer_window"
MODEL_VERSION = "2.0.0"

# Loss epsilon to prevent log(0)
LOSS_EPSILON = 1e-10

if __name__ == "__main__":
    print("AmysEcho Configuration")
    print("=" * 60)
    print(f"Data Dir: {DATA_DIR}")
    print(f"Manifest: {MANIFEST_PATH}")
    print(f"Window Size: {WINDOW_SIZE} frames")
    print(f"Window Features: {WINDOW_FEATURE_SIZE}")
    print(f"MLP Architecture: {MLP_LAYER1_SIZE} -> {MLP_LAYER2_SIZE}")
    print(f"Priority Weights: H={HAND_PRIORITY_FACTOR}, P={POSE_PRIORITY_FACTOR}, F={FACE_PRIORITY_FACTOR}")
    print(f"Learning Rate: {LEARNING_RATE}")
    print(f"Dropout: {DROPOUT_RATE}")
    print("=" * 60)
