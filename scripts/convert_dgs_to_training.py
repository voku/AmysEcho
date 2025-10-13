#!/usr/bin/env python3
"""
Convert DGS samples to the normalized training format consumed by the MLP trainer
"""

import json
import sys

def convert_dgs_to_training(dgs_file, output_file):
    """Convert DGS samples JSON to training data format"""

    # Load DGS samples
    with open(dgs_file, 'r') as f:
        dgs_data = json.load(f)

    # Convert to training format
    training_data = []

    # Group samples by gesture
    gesture_samples = {}
    for sample in dgs_data['samples']:
        label = sample['label']
        if label not in gesture_samples:
            gesture_samples[label] = []
        gesture_samples[label].append(sample['landmarks'])

    # Create training entries
    for gesture, samples in gesture_samples.items():
        training_entry = {
            "gestureDefinitionId": gesture,
            "frames": samples
        }
        training_data.append(training_entry)

    # Save training data
    with open(output_file, 'w') as f:
        json.dump(training_data, f, indent=2)

    print(f"Converted {len(dgs_data['samples'])} samples from {len(gesture_samples)} gestures")
    print(f"Saved to {output_file}")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python convert_dgs_to_training.py <dgs_file> <output_file>")
        sys.exit(1)

    dgs_file = sys.argv[1]
    output_file = sys.argv[2]
    convert_dgs_to_training(dgs_file, output_file)