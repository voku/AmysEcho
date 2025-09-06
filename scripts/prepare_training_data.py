#!/usr/bin/env python3
"""
Prepare Training Data Script for Amy's Echo

This script combines video-extracted landmark data with existing training data
and prepares it for MLP training.

Usage:
python scripts/prepare_training_data.py --video-data ../server/data/dgs_video_samples.json --existing-data ../server/dist/data/dgs_samples.json --output ../server/data/dgs_samples.json
"""

import json
import os
import argparse
from typing import List, Dict, Any

def load_json_file(file_path: str) -> Dict[str, Any]:
    """Load JSON data from file"""
    if not os.path.exists(file_path):
        print(f"Warning: File {file_path} does not exist, returning empty data")
        return {"samples": []}

    with open(file_path, 'r') as f:
        return json.load(f)

def merge_training_data(video_data: Dict[str, Any], existing_data: Dict[str, Any]) -> Dict[str, Any]:
    """Merge video data with existing training data"""
    merged_samples = []

    # Add video samples
    for sample in video_data.get("samples", []):
        merged_samples.append({
            "label": sample["label"],
            "landmarks": sample["landmarks"]
        })

    # Add existing samples (if they have valid landmarks)
    for sample in existing_data.get("samples", []):
        landmarks = sample.get("landmarks", [])
        if landmarks and len(landmarks) >= 21:  # At least one hand
            merged_samples.append({
                "label": sample.get("label", "unknown"),
                "landmarks": landmarks
            })

    return {"samples": merged_samples}

def validate_samples(samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Validate and clean samples"""
    valid_samples = []

    for sample in samples:
        label = sample.get("label")
        landmarks = sample.get("landmarks", [])

        if not label or not landmarks:
            continue

        # Ensure landmarks is a list of 42 points (2 hands)
        if isinstance(landmarks, list) and len(landmarks) >= 21:
            # Pad to 42 landmarks if necessary
            while len(landmarks) < 42:
                landmarks.append([0.0, 0.0, 0.0])

            # Truncate to 42 if too many
            landmarks = landmarks[:42]

            valid_samples.append({
                "label": label,
                "landmarks": landmarks
            })

    return valid_samples

def save_training_data(data: Dict[str, Any], output_path: str):
    """Save training data to file"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Saved {len(data['samples'])} samples to {output_path}")

def print_statistics(samples: List[Dict[str, Any]]):
    """Print statistics about the training data"""
    from collections import Counter

    labels = [s["label"] for s in samples]
    label_counts = Counter(labels)

    print(f"\nTraining Data Statistics:")
    print(f"Total samples: {len(samples)}")
    print(f"Unique gestures: {len(label_counts)}")
    print(f"Samples per gesture:")

    for label, count in sorted(label_counts.items()):
        print(f"  {label}: {count}")

def main():
    parser = argparse.ArgumentParser(description="Prepare training data by merging video and existing data")
    parser.add_argument('--video-data', required=True, help='Path to video-extracted landmark data')
    parser.add_argument('--existing-data', help='Path to existing training data (optional)')
    parser.add_argument('--output', required=True, help='Output file path')

    args = parser.parse_args()

    print("Preparing training data...")

    # Load data
    video_data = load_json_file(args.video_data)
    existing_data = load_json_file(args.existing_data) if args.existing_data else {"samples": []}

    print(f"Video samples: {len(video_data.get('samples', []))}")
    print(f"Existing samples: {len(existing_data.get('samples', []))}")

    # Merge data
    merged_data = merge_training_data(video_data, existing_data)
    print(f"Merged samples: {len(merged_data['samples'])}")

    # Validate samples
    valid_samples = validate_samples(merged_data["samples"])
    validated_data = {"samples": valid_samples}

    print(f"Valid samples after validation: {len(valid_samples)}")

    # Print statistics
    print_statistics(valid_samples)

    # Save data
    save_training_data(validated_data, args.output)

    print("\nTraining data preparation complete!")

if __name__ == '__main__':
    main()