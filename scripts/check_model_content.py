import sys

import numpy as np


def check_model(path):
    print(f"Checking model: {path}")
    try:
        with np.load(path, allow_pickle=True) as data:
            print("Keys found in model:", sorted(data.keys()))
            for key in ['arch', 'window_size', 'input_dim', 'feature_size']:
                if key in data:
                    print(f"  {key}: {data[key]}")
                else:
                    print(f"  {key}: MISSING")

            for key in ['w1', 'b1', 'w2', 'b2', 'w3', 'b3']:
                if key in data:
                    print(f"  {key} shape: {data[key].shape}")
                else:
                    print(f"  {key}: MISSING")

            if 'labels' in data:
                print(f"  labels: {data['labels']}")
    except (OSError, FileNotFoundError, ValueError) as e:
        print(f"Error checking model: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path_to_model.npz>")
        sys.exit(1)
    check_model(sys.argv[1])
