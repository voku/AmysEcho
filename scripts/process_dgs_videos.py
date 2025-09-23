#!/usr/bin/env python3
"""
DGS Video Processing Script for Amy's Echo

This script processes German Sign Language (DGS) videos to extract hand landmark data
for training the gesture recognition model.

Usage:
python scripts/process_dgs_videos.py --videos-dir ../app/assets/videos/ --output ../server/data/dgs_video_samples.json

The script will:
1. Process each MP4 video file in the videos directory
2. Extract hand landmarks using MediaPipe
3. Save landmark sequences in the format expected by the training pipeline
"""

import cv2
import numpy as np
import json
import os
import argparse
from typing import List, Dict, Any, Optional
import sys
from mediapipe.python.solutions import hands as mp_hands
from mediapipe.python.solutions import drawing_utils as mp_drawing

class DGSVideoProcessor:
    def __init__(self, max_frames: int = 300, confidence_threshold: float = 0.7, frame_skip: int = 2):
        self.max_frames = max_frames
        self.confidence_threshold = confidence_threshold
        self.frame_skip = frame_skip
        self.hands = mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

    def extract_landmarks_from_frame(self, frame: np.ndarray) -> Optional[List[List[float]]]:
        """Extract hand landmarks from a single frame"""
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Process the frame
        results = self.hands.process(rgb_frame)

        if not results.multi_hand_landmarks:
            return None

        # Extract landmarks for both hands (42 points total)
        all_landmarks = []

        # Process left hand (first 21 landmarks)
        left_hand_processed = False
        # Process right hand (next 21 landmarks)
        right_hand_processed = False

        for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
            hand_label = handedness.classification[0].label  # 'Left' or 'Right'

            landmarks = []
            for landmark in hand_landmarks.landmark:
                landmarks.extend([landmark.x, landmark.y, landmark.z])

            if hand_label == 'Left' and not left_hand_processed:
                all_landmarks.extend(landmarks)
                left_hand_processed = True
            elif hand_label == 'Right' and not right_hand_processed:
                all_landmarks.extend(landmarks)
                right_hand_processed = True

        # Pad with zeros if hands are missing
        while len(all_landmarks) < 126:  # 42 landmarks * 3 coordinates
            all_landmarks.append(0.0)

        # Reshape to 42 landmarks with 3 coordinates each
        landmarks_42 = []
        for i in range(42):
            start_idx = i * 3
            if start_idx + 2 < len(all_landmarks):
                landmarks_42.append([
                    all_landmarks[start_idx],
                    all_landmarks[start_idx + 1],
                    all_landmarks[start_idx + 2]
                ])
            else:
                landmarks_42.append([0.0, 0.0, 0.0])

        return landmarks_42

    def process_video(self, video_path: str, gesture_name: str) -> List[Dict[str, Any]]:
        """Process a single video file and extract landmark sequences"""
        print(f"Processing video: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"Error: Could not open video {video_path}")
            return []

        samples = []
        frame_count = 0
        successful_frames = 0

        while frame_count < self.max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1

            # Skip frames for efficiency (process every Nth frame)
            if frame_count % self.frame_skip != 0:
                continue

            landmarks = self.extract_landmarks_from_frame(frame)

            if landmarks:
                successful_frames += 1
                sample = {
                    "label": gesture_name,
                    "landmarks": landmarks,
                    "frame_number": frame_count,
                    "video_source": os.path.basename(video_path)
                }
                samples.append(sample)

        cap.release()

        print(f"Extracted {successful_frames} landmark frames from {frame_count} video frames")
        return samples

    def process_videos_directory(self, videos_dir: str) -> List[Dict[str, Any]]:
        """Process all videos in a directory"""
        all_samples = []

        if not os.path.exists(videos_dir):
            print(f"Error: Videos directory {videos_dir} does not exist")
            return []

        # Map video filenames to gesture names
        video_gesture_map = {
            'alle.mp4': 'alle',
            'blau.mp4': 'blau',
            'rot.mp4': 'rot',
            'gelb.mp4': 'gelb',
            'gruen.mp4': 'gruen',
            'essen.mp4': 'essen',
            'trinken.mp4': 'trinken',
            'satt.mp4': 'satt',
            'spielen.mp4': 'spielen',
            'schwester.mp4': 'schwester',
            'nochmal.mp4': 'nochmal',
            'fertig.mp4': 'fertig'
        }

        for filename in os.listdir(videos_dir):
            if filename.endswith('.mp4'):
                gesture_name = video_gesture_map.get(filename)
                if gesture_name:
                    video_path = os.path.join(videos_dir, filename)
                    samples = self.process_video(video_path, gesture_name)
                    all_samples.extend(samples)
                else:
                    print(f"Warning: No gesture mapping found for {filename}")

        return all_samples

def save_samples_to_json(samples: List[Dict[str, Any]], output_path: str):
    """Save extracted samples to JSON file in the format expected by training"""
    # Convert to the format expected by the training pipeline
    training_data = {"samples": []}

    for sample in samples:
        training_sample = {
            "label": sample["label"],
            "landmarks": sample["landmarks"]
        }
        training_data["samples"].append(training_sample)

    # Save to file
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(training_data, f, indent=2)

    print(f"Saved {len(training_data['samples'])} samples to {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Process DGS videos to extract hand landmarks for training")
    parser.add_argument('--videos-dir', required=True, help='Directory containing DGS video files')
    parser.add_argument('--output', required=True, help='Output JSON file path')
    parser.add_argument('--max-frames', type=int, default=300, help='Maximum frames to process per video')
    parser.add_argument('--confidence', type=float, default=0.7, help='Detection confidence threshold')
    parser.add_argument('--frame-skip', type=int, default=2, help='Process every Nth frame (1 = every frame, 2 = every 2nd frame, etc.)')

    args = parser.parse_args()

    print("Starting DGS Video Processing...")
    print(f"Videos directory: {args.videos_dir}")
    print(f"Output file: {args.output}")
    print(f"Max frames per video: {args.max_frames}")
    print(f"Frame skip: {args.frame_skip}")

    processor = DGSVideoProcessor(
        max_frames=args.max_frames,
        confidence_threshold=args.confidence,
        frame_skip=args.frame_skip
    )

    samples = processor.process_videos_directory(args.videos_dir)

    if samples:
        save_samples_to_json(samples, args.output)
        print(f"\nSuccess! Processed {len(samples)} landmark samples from videos.")
    else:
        print("No samples were extracted from the videos.")
        sys.exit(1)

if __name__ == '__main__':
    main()