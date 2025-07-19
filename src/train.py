import sys
import json
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
import tensorflow as tf


SEQUENCE_LENGTH = 30
NUM_FEATURES = 63  # 21 landmarks * (x,y,z)


def load_samples(data: Any) -> (np.ndarray, np.ndarray, Dict[str, int]):
    """Convert raw JSON landmark data into padded numpy arrays."""
    sequences: List[np.ndarray] = []
    labels: List[int] = []
    label_map: Dict[str, int] = {}

    for item in data:
        # support plain arrays or objects with keys
        if isinstance(item, dict):
            landmarks = item.get("landmarkData") or item.get("landmarks")
            label = item.get("gestureDefinitionId") or item.get("label") or "0"
        else:
            landmarks = item
            label = "0"

        if landmarks is None:
            continue

        arr = np.array(landmarks, dtype=np.float32)
        arr = arr.reshape((-1, NUM_FEATURES))  # frames x 63

        if arr.shape[0] > SEQUENCE_LENGTH:
            arr = arr[:SEQUENCE_LENGTH]
        else:
            pad_len = SEQUENCE_LENGTH - arr.shape[0]
            arr = np.pad(arr, ((0, pad_len), (0, 0)), "constant")

        if label not in label_map:
            label_map[label] = len(label_map)
        sequences.append(arr)
        labels.append(label_map[label])

    if not sequences:
        raise ValueError("No valid training data provided")

    X = np.stack(sequences)
    y = np.array(labels, dtype=np.int32)
    return X, y, label_map


def train_model(X: np.ndarray, y: np.ndarray, num_classes: int) -> bytes:
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(SEQUENCE_LENGTH, NUM_FEATURES)),
            tf.keras.layers.LSTM(32, return_sequences=True),
            tf.keras.layers.LSTM(32),
            tf.keras.layers.Dense(16, activation="relu"),
            tf.keras.layers.Dropout(0.5),
            tf.keras.layers.Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    model.fit(X, y, epochs=5, batch_size=8, verbose=0)

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()
    return tflite_model

def main():
    if len(sys.argv) < 2:
        print("Usage: train.py <data.json>")
        return 1
    data_path = Path(sys.argv[1])
    data = json.loads(data_path.read_text())

    X, y, label_map = load_samples(data)
    tflite_bytes = train_model(X, y, len(label_map))

    out = Path("trained_model.tflite")
    out.write_bytes(tflite_bytes)
    print("model saved to", out)
    return 0

if __name__ == '__main__':
    sys.exit(main())
