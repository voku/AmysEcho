"""
This script processes the 'german_sign_language.csv' dataset from Kaggle.
It converts the data into the JSON format required by the AmysEcho server's
/train-model endpoint.

Author: Gemini
Date: 2025-09-04

Instructions:
1.  Download the 'german_sign_language.csv' file from:
    https://www.kaggle.com/datasets/constantinwerner/german-sign-language-dgs-alphabet
2.  Place the downloaded file in the 'server/data' directory.
3.  Run this script from the project's root directory:
    `python scripts/process_kaggle_dgs_alphabet.py`
4.  The script will generate a 'dgs_alphabet_training_data.json' file in the 'docs'
    directory, which can then be posted to the server.
"""
import csv
import json
import os

# The number of landmarks per hand in MediaPipe
MEDIAPIPE_HAND_LANDMARKS = 21

# The total number of landmarks expected by the server (2 hands)
TOTAL_LANDMARKS = MEDIAPIPE_HAND_LANDMARKS * 2

# --- Dataset Details ---
# The Kaggle dataset provides 21 3D landmarks for a SINGLE hand.
# The AmysEcho server expects a 42-landmark vector for TWO hands.
#
# We will place the dataset's landmarks in the 'right hand' slot (landmarks 22-42)
# and leave the 'left hand' slot (landmarks 1-21) as zeros. This is a common
# convention for single-hand gestures.

def process_csv_to_json(input_csv_path, output_json_path):
    """
    Reads the Kaggle CSV, converts each row to the server's expected format,
    and saves the result as a single JSON file.
    """
    if not os.path.exists(input_csv_path):
        print(f"ERROR: Input CSV file not found at '{input_csv_path}'")
        print("Please download the file from Kaggle and place it in the 'server/data' directory.")
        return

    all_samples = []

    print(f"INFO: Reading and processing '{input_csv_path}'...")

    with open(input_csv_path, newline='') as csvfile:
        reader = csv.reader(csvfile)
        next(reader)  # Skip the header row

        for row in reader:
            label = row[0]
            # The first column is the label, the next 63 are landmark coordinates
            coords = [float(x) for x in row[1:]]

            # Initialize a full 42-point landmark list with zeros for two hands
            landmark_data = [[0.0, 0.0, 0.0]] * TOTAL_LANDMARKS

            # The dataset has 21 landmarks (63 coordinates)
            if len(coords) != MEDIAPIPE_HAND_LANDMARKS * 3:
                print(f"WARNING: Skipping row for label '{label}' due to unexpected coordinate count: {len(coords)}")
                continue

            # Populate the 'right hand' portion of the landmark vector
            hand_offset = MEDIAPIPE_HAND_LANDMARKS  # Start after the left hand
            for i in range(MEDIAPIPE_HAND_LANDMARKS):
                x = coords[i * 3]
                y = coords[i * 3 + 1]
                z = coords[i * 3 + 2]
                target_index = hand_offset + i
                landmark_data[target_index] = [x, y, z]

            all_samples.append({
                "gestureDefinitionId": label,
                "landmarkData": landmark_data
            })

    output_payload = {"samples": all_samples}

    try:
        with open(output_json_path, 'w') as f:
            json.dump(output_payload, f, indent=2)
        print(f"SUCCESS: Converted {len(all_samples)} samples.")
        print(f"         Training data saved to '{output_json_path}'")
    except OSError as e:
        print(f"ERROR: Could not write to output file '{output_json_path}'. Reason: {e}")

def main():
    """
    Main function to define file paths and run the conversion.
    """
    # Assume the script is run from the project root directory
    project_root = os.getcwd()
    input_file = os.path.join(project_root, 'server', 'data', 'german_sign_language.csv')
    output_file = os.path.join(project_root, 'docs', 'dgs_alphabet_training_data.json')

    main_dir = os.path.join(project_root, 'server', 'data')
    if not os.path.exists(main_dir):
        os.makedirs(main_dir)

    process_csv_to_json(input_file, output_file)

if __name__ == '__main__':
    main()
