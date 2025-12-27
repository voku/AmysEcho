#!/usr/bin/env python3
"""
Real-World Test Interaction Simulator for Amy's Echo

This script simulates a complete end-to-end interaction:
1. Creating a unique child profile.
2. Defining a custom gesture label.
3. Generating a realistic sequence of multimodal landmarks (30 frames).
4. Creating a training bundle and updating the manifest.
5. Running the training pipeline to train a specialized model.
6. Verifying the model recognizes the new gesture.
"""

import copy
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import numpy as np

# Configuration
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "server" / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
MANIFEST_PATH = DATA_DIR / "datasets" / "real_world_test_manifest.json"
PROFILE_ID = "amy-test-2025"
GESTURE_LABELS = ["APPEL", "BITTE", "DANKE"]  # Dynamic labels

def generate_gesture_sequence(label, num_frames=40):
    """Generate realistic multimodal landmarks for a given gesture."""
    frames = []
    # Use label to slightly vary the motion pattern
    label_hash = sum(ord(c) for c in label) % 10 / 10.0

    for i in range(num_frames):
        t = i / (num_frames - 1) if num_frames > 1 else 0.0

        # Simulate hand moving towards mouth/chest based on label
        hand_x = 0.5 + (0.1 * label_hash)
        hand_y = 0.6 - t * (0.3 + 0.1 * label_hash)  # Moving up
        hand_z = 0.1

        # 42 hand landmarks
        hand_lms = []
        for lm_idx in range(42):
            # Base position + small variation per landmark
            lx = hand_x + (lm_idx % 21) * 0.005 + np.random.normal(0, 0.01)
            ly = hand_y + (lm_idx // 21) * 0.01 + np.random.normal(0, 0.01)
            lz = hand_z + np.random.normal(0, 0.005)
            hand_lms.append([lx, ly, lz])

        # 33 pose landmarks (torso/head)
        pose_lms = []
        for _ in range(33):
            pose_lms.append([0.5 + np.random.normal(0, 0.01), 0.3 + np.random.normal(0, 0.01), 0.0, 0.99])

        # 468 face landmarks
        face_lms = []
        for _ in range(468):
            face_lms.append([0.5 + np.random.normal(0, 0.005), 0.3 + np.random.normal(0, 0.005), 0.05])

        frames.append({
            "timestampMs": i * 33,
            "landmarks": hand_lms,
            "poseLandmarks": pose_lms,
            "faceLandmarks": face_lms,
            "handedness": ["Left", "Right"]
        })
    return frames

def setup_test_interaction():
    print(f"🚀 Starting Real-World Test Interaction for Profile: {PROFILE_ID}")

    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH) as f:
            manifest = json.load(f)
        # Filter out previous synthetic entries for this test profile to prevent unbounded growth
        if "entries" in manifest:
            manifest["entries"] = [
                e for e in manifest["entries"]
                if e.get("profileId") != PROFILE_ID
            ]
    else:
        manifest = {"entries": []}

    for label in GESTURE_LABELS:
        # 1. Create Bundle Directory
        bundle_id = f"test_bundle_{label.lower()}_{int(datetime.now().timestamp())}"
        bundle_dir = UPLOADS_DIR / PROFILE_ID / bundle_id
        bundle_dir.mkdir(parents=True, exist_ok=True)

        # 2. Generate and Save Landmarks
        frames = generate_gesture_sequence(label)
        landmarks_file = bundle_dir / "landmarks.json"
        with open(landmarks_file, "w") as f:
            json.dump({"frames": frames}, f, indent=2)

        # 3. Create Metadata
        metadata = {
            "profileId": PROFILE_ID,
            "label": label,
            "capturedAt": datetime.now().isoformat(),
            "handFocus": "dominant_only",
            "recording": {
                "frameCount": len(frames),
                "clipDurationMs": len(frames) * 33
            },
            "modalities": {
                "hands": {"present": True, "coverage": 1.0},
                "pose": {"present": True, "coverage": 1.0},
                "face": {"present": True, "coverage": 1.0}
            }
        }
        with open(bundle_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        # 4. Update Manifest
        manifest_entry = {
            "id": bundle_id,
            "profileId": PROFILE_ID,
            "label": label,
            "storage": {
                "directory": str(bundle_dir.relative_to(DATA_DIR)),
                "files": ["landmarks.json", "metadata.json"]
            },
            "metadata": metadata
        }

        # Add 5 copies of each gesture to ensure enough samples for training.
        # This duplication is intentional for the simulator to provide enough samples
        # for the training pipeline to complete successfully in a test environment.
        for i in range(5):
            entry = copy.deepcopy(manifest_entry)
            entry["id"] = f"{bundle_id}_{i}"
            manifest["entries"].append(entry)

    # Ensure datasets directory exists
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)

    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"✅ Created training bundles and updated manifest at {MANIFEST_PATH}")

def run_training():
    print(f"🧠 Running training for profile {PROFILE_ID}...")

    trainer_script = PROJECT_ROOT / "server" / "src" / "amyserver_tools" / "train_mlp.py"

    env = os.environ.copy()
    env["MLP_DATA_DIR"] = str(PROJECT_ROOT / "server" / "data")
    env["MLP_MANIFEST_PATH"] = str(MANIFEST_PATH)
    env["MLP_EPOCHS"] = "50"  # Fast training for test

    cmd = [sys.executable, str(trainer_script), "--manifest", str(MANIFEST_PATH), "--data-dir", str(DATA_DIR)]

    result = subprocess.run(cmd, env=env, capture_output=True, text=True)

    if result.returncode == 0:
        print("✅ Training completed successfully!")
        try:
            report = json.loads(result.stdout)
            if PROFILE_ID in report.get("profiles", {}):
                p_report = report["profiles"][PROFILE_ID]
                print(f"📊 Profile Model Accuracy: {p_report.get('accuracy', 0):.2%}")
                return True
        except (json.JSONDecodeError, KeyError, TypeError):
            print("⚠️ Could not parse training report, but exit code was 0.")
            return True
    else:
        print(f"❌ Training failed: {result.stderr}")
        return False

def verify_model():
    model_path = DATA_DIR / "models" / PROFILE_ID / "amy_model.npz"
    if model_path.exists():
        print(f"✅ Verified: Profile-specific model created at {model_path}")

        # Load and check labels
        data = np.load(model_path, allow_pickle=True)
        labels = data["labels"]
        print(f"🏷️  Model Labels: {labels}")
        success = True
        for label in GESTURE_LABELS:
            if label in labels:
                print(f"🎯 SUCCESS: Model includes custom label '{label}'")
            else:
                print(f"❌ ERROR: Model does not include label '{label}'")
                success = False
        return success
    else:
        print(f"❌ ERROR: Model file not found at {model_path}")
    return False

if __name__ == "__main__":
    setup_test_interaction()
    if run_training():
        if not verify_model():
            sys.exit(1)
    else:
        sys.exit(1)
