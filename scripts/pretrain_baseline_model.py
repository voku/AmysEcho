#!/usr/bin/env python3
"""
Pre-train Baseline Model for Amy's Echo

This script automates the DGS pre-training workflow:
1. Creates a training manifest from existing DGS video landmarks
2. Trains an MLP model using the landmarks
3. Validates the model quality
4. Outputs a report with accuracy metrics

Usage:
    python scripts/pretrain_baseline_model.py [--epochs 500] [--learning-rate 0.01]

This enables Amy's Echo to work immediately with a pre-trained baseline model,
without requiring users to record their own training videos.
"""

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from training_manifest_schema import save_training_manifest

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

# Constants
HAND_LANDMARKS = 42  # Number of hand landmark points
COORDS_PER_LANDMARK = 3  # x, y, z coordinates
HAND_LANDMARK_FEATURES = HAND_LANDMARKS * COORDS_PER_LANDMARK  # 126 total

# Project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SERVER_DATA = PROJECT_ROOT / "server" / "data"
DGS_VIDEO_DIR = SERVER_DATA / "dgs_video_examples"
DATASETS_DIR = SERVER_DATA / "datasets"
MODELS_DIR = SERVER_DATA / "models" / "global"
MANIFEST_PATH = DATASETS_DIR / "training_manifest.json"
REPORT_PATH = SERVER_DATA / "pretraining_report.json"


def get_label_from_filename(filename: str) -> str:
    """Extract label from landmark filename."""
    name = filename.removesuffix("_landmarks.json")
    return name.split("_")[0]


def count_valid_frames(landmarks_path: Path) -> int:
    """Count frames with valid hand landmarks."""
    try:
        with open(landmarks_path) as f:
            data = json.load(f)
        
        frames = data.get("frames", [])
        valid = 0
        for frame in frames:
            lm = frame.get("landmarks", [])
            if not lm:
                continue
            flat = [c for pt in lm for c in pt] if isinstance(lm[0], list) else lm
            # Check hand landmark features (42 points × 3 coords = 126)
            if any(v != 0 for v in flat[:HAND_LANDMARK_FEATURES]):
                valid += 1
        return valid
    except FileNotFoundError:
        logger.warning(f"Landmark file not found: {landmarks_path}")
        return 0
    except json.JSONDecodeError as e:
        logger.warning(f"Invalid JSON in {landmarks_path}: {e}")
        return 0
    except (KeyError, TypeError, IndexError) as e:
        logger.warning(f"Unexpected data structure in {landmarks_path}: {e}")
        return 0


def create_training_manifest(max_per_label: int = 15) -> dict:
    """Create training manifest from DGS video landmarks."""
    print("Creating training manifest from DGS video landmarks...")
    
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    
    entries = []
    label_stats = {}
    label_counts = {}
    
    files = sorted(DGS_VIDEO_DIR.glob("*_landmarks.json"))
    print(f"Found {len(files)} landmark files.")
    
    for lm_file in files:
        label = get_label_from_filename(lm_file.name)
        valid_frames = count_valid_frames(lm_file)
        
        # Track stats
        if label not in label_stats:
            label_stats[label] = {"files": 0, "valid_frames": 0}
        label_stats[label]["files"] += 1
        label_stats[label]["valid_frames"] += valid_frames
        
        # Skip files with no valid frames
        if valid_frames == 0:
            continue
        
        # Limit entries per label for balance
        count = label_counts.get(label, 0)
        if count >= max_per_label:
            continue
        label_counts[label] = count + 1
        
        entry = {
            "label": label,
            "profileId": None,
            "storage": {
                "directory": "dgs_video_examples",
                "files": [lm_file.name]
            }
        }
        entries.append(entry)
    
    manifest = {
        "version": "1.0",
        "entries": entries
    }
    
    save_training_manifest(MANIFEST_PATH, manifest)
    
    print(f"Created manifest with {len(entries)} entries.")
    print("\nLabel distribution:")
    for label, count in sorted(label_counts.items()):
        stats = label_stats.get(label, {})
        print(f"  {label}: {count} files, {stats.get('valid_frames', 0)} valid frames")
    
    return {
        "entries": len(entries),
        "labels": len(label_counts),
        "label_stats": label_stats,
        "label_counts": label_counts
    }


def run_training(epochs: int, learning_rate: float) -> dict:
    """Run MLP training and capture results."""
    print(f"\nTraining model with {epochs} epochs, learning rate {learning_rate}...")
    
    server_dir = PROJECT_ROOT / "server"
    env = os.environ.copy()
    env["PYTHONPATH"] = f"training:src:{env.get('PYTHONPATH', '')}"
    env["MLP_EPOCHS"] = str(epochs)
    env["MLP_LEARNING_RATE"] = str(learning_rate)
    
    result = subprocess.run(
        [sys.executable, "training/train_mlp.py"],
        cwd=server_dir,
        env=env,
        capture_output=True,
        text=True
    )
    
    output = result.stdout + result.stderr
    print(output)
    
    # Parse results from output
    train_acc = 0.0
    val_acc = 0.0
    samples = 0
    
    for line in output.split("\n"):
        if "Training Accuracy" in line:
            try:
                train_acc = float(line.split(":")[1].strip().rstrip("%"))
            except (IndexError, ValueError):
                logger.warning(f"Could not parse training accuracy from: {line}")
        elif "Validation Accuracy" in line:
            try:
                val_acc = float(line.split(":")[1].strip().rstrip("%"))
            except (IndexError, ValueError):
                logger.warning(f"Could not parse validation accuracy from: {line}")
        elif "Training on" in line and "samples" in line:
            try:
                samples = int(line.split("Training on")[1].split("samples")[0].strip())
            except (IndexError, ValueError):
                logger.warning(f"Could not parse sample count from: {line}")
    
    return {
        "success": result.returncode == 0,
        "training_accuracy": train_acc,
        "validation_accuracy": val_acc,
        "samples": samples,
        "epochs": epochs,
        "learning_rate": learning_rate
    }


def validate_model() -> dict:
    """Validate the generated model file."""
    model_path = MODELS_DIR / "amy_model.npz"
    
    if not model_path.exists():
        return {"valid": False, "error": "Model file not found"}
    
    try:
        import numpy as np
        data = np.load(model_path, allow_pickle=True)
        
        labels = list(data.get("labels", []))
        input_dim = int(data.get("input_dim", 0))
        window_size = int(data.get("window_size", 0))
        
        return {
            "valid": True,
            "path": str(model_path),
            "size_bytes": model_path.stat().st_size,
            "labels": labels,
            "label_count": len(labels),
            "input_dim": input_dim,
            "window_size": window_size
        }
    except ImportError as e:
        return {"valid": False, "error": f"numpy not available: {e}"}
    except FileNotFoundError:
        return {"valid": False, "error": "Model file not found"}
    except (KeyError, ValueError, TypeError) as e:
        return {"valid": False, "error": f"Invalid model format: {e}"}


def generate_report(manifest_stats: dict, training_results: dict, model_info: dict) -> dict:
    """Generate pre-training report."""
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "success" if training_results["success"] and model_info["valid"] else "failed",
        "manifest": manifest_stats,
        "training": training_results,
        "model": model_info,
        "quality_assessment": {
            "training_accuracy": training_results["training_accuracy"],
            "validation_accuracy": training_results["validation_accuracy"],
            "is_usable": training_results["validation_accuracy"] >= 10.0,
            "recommendation": ""
        }
    }
    
    # Add recommendation
    val_acc = training_results["validation_accuracy"]
    if val_acc >= 50:
        report["quality_assessment"]["recommendation"] = "Excellent - Model is production-ready"
    elif val_acc >= 30:
        report["quality_assessment"]["recommendation"] = "Good - Model provides useful baseline"
    elif val_acc >= 15:
        report["quality_assessment"]["recommendation"] = "Fair - Model can assist recognition but needs user training"
    elif val_acc >= 10:
        report["quality_assessment"]["recommendation"] = "Minimal - Model provides starting point, user training recommended"
    else:
        report["quality_assessment"]["recommendation"] = "Insufficient - More training data or epochs needed"
    
    return report


def main():
    parser = argparse.ArgumentParser(
        description="Pre-train baseline DGS model for Amy's Echo"
    )
    parser.add_argument(
        "--epochs", type=int, default=500,
        help="Number of training epochs (default: 500)"
    )
    parser.add_argument(
        "--learning-rate", type=float, default=0.01,
        help="Learning rate (default: 0.01)"
    )
    parser.add_argument(
        "--max-per-label", type=int, default=15,
        help="Maximum files per label for balanced training (default: 15)"
    )
    parser.add_argument(
        "--skip-training", action="store_true",
        help="Skip training, only create manifest"
    )
    args = parser.parse_args()
    
    print("=" * 60)
    print("Amy's Echo - DGS Pre-Training Pipeline")
    print("=" * 60)
    
    # Step 1: Create training manifest
    manifest_stats = create_training_manifest(args.max_per_label)
    
    if args.skip_training:
        print("\nSkipping training (--skip-training flag set)")
        return
    
    # Step 2: Run training
    training_results = run_training(args.epochs, args.learning_rate)
    
    # Step 3: Validate model
    model_info = validate_model()
    
    # Step 4: Generate report
    report = generate_report(manifest_stats, training_results, model_info)
    
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)
    
    print("\n" + "=" * 60)
    print("PRE-TRAINING REPORT")
    print("=" * 60)
    print(f"Status: {report['status'].upper()}")
    print(f"Labels trained: {manifest_stats['labels']}")
    print(f"Training samples: {training_results['samples']}")
    print(f"Training accuracy: {training_results['training_accuracy']:.2f}%")
    print(f"Validation accuracy: {training_results['validation_accuracy']:.2f}%")
    print(f"Model usable: {'Yes' if report['quality_assessment']['is_usable'] else 'No'}")
    print(f"Recommendation: {report['quality_assessment']['recommendation']}")
    print(f"\nReport saved to: {REPORT_PATH}")
    print("=" * 60)
    
    # Exit with error if model is not usable
    if not report['quality_assessment']['is_usable']:
        sys.exit(1)


if __name__ == "__main__":
    main()
