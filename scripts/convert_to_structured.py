#!/usr/bin/env python3
"""
Convert flat landmark data back to structured format
"""

import argparse
import json


def convert_flat_to_structured(landmarks):
    """Convert flat array to list of [x,y,z] points"""
    structured = []
    for i in range(0, len(landmarks), 3):
        if i + 2 < len(landmarks):
            structured.append([
                landmarks[i],
                landmarks[i + 1],
                landmarks[i + 2]
            ])
    return structured

def convert_training_data(input_file, output_file):
    """Convert training data from flat to structured format"""
    print(f"Converting {input_file} to structured landmark format...")

    # Load data
    with open(input_file) as f:
        data = json.load(f)

    converted_samples = []

    for sample in data.get('samples', []):
        label = sample.get('label')
        landmarks = sample.get('landmarks', [])

        if label and landmarks:
            # Convert flat landmarks to structured format
            structured_landmarks = convert_flat_to_structured(landmarks)

            converted_samples.append({
                'label': label,
                'landmarks': structured_landmarks
            })

    # Save converted data
    converted_data = {'samples': converted_samples}

    with open(output_file, 'w') as f:
        json.dump(converted_data, f, indent=2)

    print(f"Converted {len(converted_samples)} samples")
    print(f"Saved to {output_file}")

def main():
    parser = argparse.ArgumentParser(description="Convert flat landmark data to structured format")
    parser.add_argument('--input', required=True, help='Input JSON file with flat landmarks')
    parser.add_argument('--output', required=True, help='Output JSON file with structured landmarks')

    args = parser.parse_args()

    convert_training_data(args.input, args.output)

if __name__ == '__main__':
    main()
