#!/usr/bin/env python3
import sys
import time
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: mockTrain.py <data.json>")
        sys.exit(1)

    # simulate progress
    for p in (0, 50, 100):
        print(f"PROGRESS:{p}", flush=True)
        time.sleep(0.01)

    # write dummy model file
    Path("trained_model.json").write_text('{"mock": true}')


if __name__ == "__main__":
    main()
