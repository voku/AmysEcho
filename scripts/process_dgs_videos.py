#!/usr/bin/env python3
"""
DGS Video Processing Script for Amy's Echo

This script processes German Sign Language (DGS) videos to extract hand landmark data
for training the gesture recognition model.

Usage:
python scripts/process_dgs_videos.py --videos-dir ../app/assets/videos/ --output ../server/data/dgs_video_samples.json

The script will:
1. Process each MP4 video file in the videos directory
2. Extract hand landmarks using MediaPipe Tasks API
3. Save landmark sequences in the format expected by the training pipeline
"""

import cv2
import numpy as np
import json
import os
import argparse
import sys
from typing import List, Dict, Any, Optional

try:
    import mediapipe as mp
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision as mp_vision
except ImportError:
    print("Error: MediaPipe is not installed or incorrectly installed.")
    print("Please install it with: pip install mediapipe")
    sys.exit(1)

class DGSVideoProcessor:
    def __init__(self, model_path: str, max_frames: int = 300, confidence_threshold: float = 0.5, frame_skip: int = 2):
        self.max_frames = max_frames
        self.frame_skip = frame_skip
        self.model_path = model_path
        
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"MediaPipe model not found at {self.model_path}")

        base_options = mp_tasks.BaseOptions(model_asset_path=self.model_path)
        options = mp_vision.HandLandmarkerOptions(
            base_options=base_options,
            num_hands=2,
            min_hand_detection_confidence=confidence_threshold,
            min_hand_presence_confidence=confidence_threshold,
            min_tracking_confidence=confidence_threshold,
            running_mode=mp_vision.RunningMode.IMAGE
        )
        self.landmarker = mp_vision.HandLandmarker.create_from_options(options)

    def extract_landmarks_from_frame(self, frame: np.ndarray) -> Optional[List[List[float]]]:
        """Extract hand landmarks from a single frame"""
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Create MediaPipe Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Process the frame
        result = self.landmarker.detect(mp_image)

        if not result.hand_landmarks:
            return None

        # Initialize 42 landmarks (21 for left, 21 for right) with zeros
        # Format: [[x,y,z], [x,y,z], ...]
        landmarks_42 = [[0.0, 0.0, 0.0] for _ in range(42)]
        
        # Track which hands we've processed to avoid duplicates if multiple hands of same type detected
        left_hand_processed = False
        right_hand_processed = False

        # Iterate through detected hands
        for i, hand_landmarks in enumerate(result.hand_landmarks):
            # Get handedness (Left/Right)
            # Note: MediaPipe Tasks handedness is a list of lists (one list per hand)
            if i < len(result.handedness):
                handedness_category = result.handedness[i][0]
                hand_label = handedness_category.category_name # "Left" or "Right" 
                
                # Extract coordinates
                current_hand_coords = []
                for landmark in hand_landmarks:
                    current_hand_coords.append([landmark.x, landmark.y, landmark.z])
                
                # Map to correct slots
                # Indices 0-20: Left Hand
                # Indices 21-41: Right Hand
                
                if hand_label == 'Left' and not left_hand_processed:
                    for j, coord in enumerate(current_hand_coords):
                        if j < 21:
                            landmarks_42[j] = coord
                    left_hand_processed = True
                    
                elif hand_label == 'Right' and not right_hand_processed:
                    for j, coord in enumerate(current_hand_coords):
                        if j < 21:
                            landmarks_42[21 + j] = coord
                    right_hand_processed = True

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
    parser.add_argument('--confidence', type=float, default=0.5, help='Detection confidence threshold')
    parser.add_argument('--frame-skip', type=int, default=2, help='Process every Nth frame')
    parser.add_argument('--model-path', default='server/data/models/hand_landmarker.task', help='Path to MediaPipe model task file')

    args = parser.parse_args()

    print("Starting DGS Video Processing...")
    print(f"Videos directory: {args.videos_dir}")
    print(f"Output file: {args.output}")
    print(f"Model path: {args.model_path}")

    try:
        processor = DGSVideoProcessor(
            model_path=args.model_path,
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
            
    except Exception as e:
        print(f"Fatal Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
