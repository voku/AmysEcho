#!/usr/bin/env python3
"""
Manual Gesture Data Collection Tool for Amy's Echo

This script helps collect hand landmark data for DGS gestures.
Currently supports manual entry and sample data generation.

Usage:
python scripts/collect_gesture_data.py --gesture red --source manual
python scripts/collect_gesture_data.py --gesture apple --source sample

The collected data will be saved to docs/gesture_training_data.json
"""

import json
import os
import argparse
import random

def generate_sample_landmarks(gesture_name):
    """Generate sample landmark data for testing"""
    # Create some variation in the sample data
    base_x = 0.5 + random.uniform(-0.1, 0.1)
    base_y = 0.5 + random.uniform(-0.1, 0.1)
    base_z = -0.05 + random.uniform(-0.02, 0.02)

    # Generate 21 landmarks as array of [x,y,z] tuples for one hand
    landmarks = []
    for i in range(21):
        x = base_x + random.uniform(-0.05, 0.05)
        y = base_y + random.uniform(-0.05, 0.05)
        z = base_z + random.uniform(-0.02, 0.02)
        landmarks.append([x, y, z])

    # Return in the format expected by the server (42 landmarks for 2 hands)
    # Left hand (first 21) as zeros, right hand (last 21) with data
    left_hand = [[0.0, 0.0, 0.0]] * 21
    return left_hand + landmarks

def manual_landmark_entry(gesture_name):
    """Allow manual entry of landmark coordinates"""
    print(f"Manual landmark entry for: {gesture_name}")
    print("Enter 21 landmarks as x,y,z;x,y,z;... format")
    print("Or press Enter for generated sample data")

    try:
        coords_input = input("Enter coordinates: ")
        if not coords_input.strip():
            # Return sample data
            return generate_sample_landmarks(gesture_name)

        # Parse landmark strings
        landmark_strings = coords_input.split(';')
        if len(landmark_strings) != 21:
            print(f"ERROR: Expected 21 landmarks, got {len(landmark_strings)}")
            return None

        landmarks = []
        for lm_str in landmark_strings:
            coords = [float(x.strip()) for x in lm_str.split(',')]
            if len(coords) != 3:
                print(f"ERROR: Each landmark must have 3 coordinates")
                return None
            landmarks.append(coords)

        # Return in 2-hand format (left hand zeros + right hand data)
        left_hand = [[0.0, 0.0, 0.0]] * 21
        return left_hand + landmarks

    except ValueError as e:
        print(f"ERROR: Invalid coordinates: {e}")
        return None

def save_training_data(gesture_name, landmarks_list):
    """Save collected landmark data to training file"""
    output_file = "docs/gesture_training_data.json"

    # Load existing data if file exists
    if os.path.exists(output_file):
        with open(output_file, 'r') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = {"samples": []}
    else:
        data = {"samples": []}

    # Add new samples
    for i, landmarks in enumerate(landmarks_list):
        sample = {
            "gestureDefinitionId": gesture_name,
            "landmarkData": landmarks
        }
        data["samples"].append(sample)

    # Save updated data
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Saved {len(landmarks_list)} samples for {gesture_name} to {output_file}")

def main():
    parser = argparse.ArgumentParser(description="Collect gesture training data for Amy's Echo")
    parser.add_argument('--gesture', required=True, help='Gesture name (e.g., red, apple)')
    parser.add_argument('--source', choices=['manual', 'sample'],
                       default='sample', help='Data source')
    parser.add_argument('--count', type=int, default=5,
                       help='Number of samples to generate (for sample source)')

    args = parser.parse_args()

    print(f"Collecting data for gesture: {args.gesture}")
    print(f"Source: {args.source}")

    landmarks = []

    if args.source == 'sample':
        print(f"Generating {args.count} sample landmarks...")
        for i in range(args.count):
            sample = generate_sample_landmarks(args.gesture)
            landmarks.append(sample)
        print(f"Generated {len(landmarks)} samples")
    elif args.source == 'manual':
        sample = manual_landmark_entry(args.gesture)
        if sample:
            landmarks = [sample]

    if landmarks:
        save_training_data(args.gesture, landmarks)
        print("SUCCESS: Training data collected and saved!")
    else:
        print("No data collected")

if __name__ == '__main__':
    main()