#!/usr/bin/env python3
"""
Convert structured landmark data to flat format for MLP training

This script converts the landmark data from our video processing
(from list of [x,y,z] points) to the flat format expected by the MLP training script.
"""

import argparse
import json


def convert_landmarks_to_flat(landmarks):
    """Convert list of [x,y,z] points to flat array"""
    flat = []
    for point in landmarks:
        flat.extend(point)
    return flat

def convert_training_data(input_file, output_file):
    """Convert training data format"""
    print(f"Converting {input_file} to flat landmark format...")

    # Load data
    with open(input_file) as f:
        data = json.load(f)

    converted_samples = []

    for sample in data.get('samples', []):
        label = sample.get('label')
        landmarks = sample.get('landmarks', [])

        if label and landmarks:
            # Convert structured landmarks to flat array
            flat_landmarks = convert_landmarks_to_flat(landmarks)

            converted_samples.append({
                'label': label,
                'landmarks': flat_landmarks
            })

    # Save converted data
    converted_data = {'samples': converted_samples}

    with open(output_file, 'w') as f:
        json.dump(converted_data, f, indent=2)

    print(f"Converted {len(converted_samples)} samples")
    print(f"Saved to {output_file}")

def main():
    parser = argparse.ArgumentParser(description="Convert landmark data to flat format for training")
    parser.add_argument('--input', required=True, help='Input JSON file with structured landmarks')
    parser.add_argument('--output', required=True, help='Output JSON file with flat landmarks')

    args = parser.parse_args()

    convert_training_data(args.input, args.output)

if __name__ == '__main__':
    main()
