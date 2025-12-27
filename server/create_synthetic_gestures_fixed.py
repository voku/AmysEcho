#!/usr/bin/env python3
"""Create simple synthetic training data to fix MediaPipe zero landmarks issue"""

import json
from pathlib import Path

import numpy as np


def main():
    """Create simple synthetic gesture training data"""

    # Define German gestures with simple but realistic hand patterns
    gestures = {
        "HELLO": [
            # Hand opening and closing gesture
            [(0.3 + i*0.02, 0.4 + np.sin(i*0.1)*0.02, 0.01) for i in range(15)],
            [(0.3 + i*0.02, 0.4 + np.sin(i*0.1)*0.02, 0.01) for i in range(15, 40)]
        ],
        "BITTE": [
            # Flat hand, slight movement
            [(0.4, 0.3 + np.sin(i*0.05)*0.01, 0.0) for i in range(20)]
        ],
        "JA": [
            # Thumbs up
            [(0.35, 0.25 + i*0.008, 0.1 + np.cos(i*0.1)*0.008, 0.0) for i in range(25)]
        ],
        "NEIN": [
            # Hand shaking motion
            [(0.4 + np.sin(i*0.2)*0.01, 0.3 + np.cos(i*0.2)*0.01, 0.0) for i in range(20)]
        ]
    }

    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(exist_ok=True)

    samples = []

    print("🎯 Creating synthetic gesture training data...")

    for gesture_name, frames_data in gestures.items():
        sample = {
            "path": f"synthetic_{gesture_name.lower()}.mp4",
            "label": gesture_name.lower(),
            "frames": []
        }

        # Create landmark data for each frame
        for frame_data in frames_data:
            landmarks = np.array(frame_data, dtype=np.float32)
            sample["frames"].append({
                "landmarks": landmarks.tolist()
            })

        samples.append(sample)
        print(f"   ✓ {gesture_name}: {len(frames_data)} frames with realistic coordinates")

    # Save synthetic dataset
    output_file = data_dir / "synthetic_gestures_fixed.json"
    with open(output_file, 'w') as f:
        json.dump(samples, f, indent=2)

    print(f"\n✅ Created synthetic dataset: {output_file}")
    print(f"Total gestures: {len(samples)}")

    total_frames = sum(len(s['frames']) for s in samples)
    print(f"Total frames: {total_frames}")

    # Create manifest
    manifest_entries = []

    for i, sample in enumerate(samples):
        entry = {
            "label": sample['label'].upper(),
            "id": f"synthetic_{i:03d}_{sample['label']}",
            "storage": {
                "type": "file",
                "clip": sample['path']
            },
            "metadata": {
                "clipFilename": sample['path'],
                "label": sample['label'].upper(),
                "capturedAt": "2024-01-01T00:00:00.000Z",
                "profileId": "global"
            }
        }
        manifest_entries.append(entry)

    manifest = {"entries": manifest_entries}

    manifest_file = data_dir / "synthetic_manifest_fixed.json"
    with open(manifest_file, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"✅ Created synthetic manifest: {manifest_file}")

    return output_file, manifest_file

if __name__ == "__main__":
    main()
