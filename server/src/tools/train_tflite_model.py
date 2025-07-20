#!/usr/bin/env python3
"""Train a gesture classifier from labeled videos.

This script expects a data directory containing one subfolder per gesture label.
Each folder should contain MP4 videos of that gesture performed by Amy.
It extracts hand landmarks using MediaPipe, trains a simple Keras model,
and outputs a TFLite file that can be bundled with the mobile app.
"""

import argparse
import os
import glob
from typing import List

import numpy as np
import tensorflow as tf
import cv2
import mediapipe as mp

mp_hands = mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=1)


def extract_landmarks(video_path: str) -> List[List[float]]:
    """Return a list of landmark arrays for each detected frame."""
    cap = cv2.VideoCapture(video_path)
    frames: List[List[float]] = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = mp_hands.process(frame_rgb)
        if res.multi_hand_landmarks:
            hand = res.multi_hand_landmarks[0]
            coords = []
            for lm in hand.landmark:
                coords.extend([lm.x, lm.y, lm.z])
            frames.append(coords)
    cap.release()
    return frames


def load_dataset(data_dir: str):
    X: List[List[float]] = []
    y: List[int] = []
    labels = sorted(
        d for d in os.listdir(data_dir)
        if os.path.isdir(os.path.join(data_dir, d))
    )
    for idx, label in enumerate(labels):
        videos = glob.glob(os.path.join(data_dir, label, '*.mp4'))
        for vid in videos:
            for frame in extract_landmarks(vid):
                X.append(frame)
                y.append(idx)
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32), labels


def train_model(X: np.ndarray, y: np.ndarray, num_labels: int) -> tf.keras.Model:
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(X.shape[1],)),
        tf.keras.layers.Dense(64, activation='relu'),
        tf.keras.layers.Dense(num_labels, activation='softmax'),
    ])
    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy'],
    )
    model.fit(X, y, epochs=10)
    return model


def save_tflite(model: tf.keras.Model, out_path: str) -> None:
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()
    with open(out_path, 'wb') as f:
        f.write(tflite_model)


def main() -> None:
    parser = argparse.ArgumentParser(description='Train gesture model from videos')
    parser.add_argument('data_dir', help='Directory containing gesture subfolders')
    parser.add_argument('output', help='Path to write gestures.tflite')
    args = parser.parse_args()

    X, y, labels = load_dataset(args.data_dir)
    model = train_model(X, y, len(labels))
    save_tflite(model, args.output)
    print('Model trained for labels:', labels)
    print('Saved to', args.output)


if __name__ == '__main__':
    main()
