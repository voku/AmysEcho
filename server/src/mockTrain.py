import sys, time
from pathlib import Path

if len(sys.argv) < 2:
    print('usage: mockTrain.py <data.json>')
    sys.exit(1)

# simulate progress
for p in (0, 50, 100):
    print(f'PROGRESS:{p}', flush=True)
    time.sleep(0.01)

# write dummy model file
Path('trained_model.tflite').write_bytes(b'MOCK')
