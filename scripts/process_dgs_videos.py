#!/usr/bin/env python3
"""
DGS Video Processing Script for Amy's Echo (Multimodal Edition)

This script processes German Sign Language (DGS) videos to extract 
Hands + Pose + Face landmarks for training the multimodal gesture recognition model.

Usage:
python scripts/process_dgs_videos.py --videos-dir ../app/assets/videos/ --output ../server/data/dgs_video_samples.json --split-output

The script will:
1. Load Hand, Pose, and Face landmarkers.
2. Process each frame through all three models.
3. Fuse the results into a single vector: [Hands(42) + Pose(33) + Face(468)].
4. Save the data for training.
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
    print("Error: MediaPipe is not installed.")
    sys.exit(1)

class DGSVideoProcessor:
    def __init__(self, models_dir: str, confidence: float = 0.5):
        self.confidence = confidence
        
        # Paths
        self.hand_model = os.path.join(models_dir, "hand_landmarker.task")
        self.pose_model = os.path.join(models_dir, "pose_landmarker.task")
        self.face_model = os.path.join(models_dir, "face_landmarker.task")
        
        # Verify models exist
        for m in [self.hand_model, self.pose_model, self.face_model]:
            if not os.path.exists(m):
                raise FileNotFoundError(f"Model not found: {m}")

        # Initialize Landmarkers
        # 1. Hands
        base_options_hand = mp_tasks.BaseOptions(model_asset_path=self.hand_model)
        options_hand = mp_vision.HandLandmarkerOptions(
            base_options=base_options_hand,
            num_hands=2,
            min_hand_detection_confidence=confidence,
            min_hand_presence_confidence=confidence,
            min_tracking_confidence=confidence,
            running_mode=mp_vision.RunningMode.IMAGE
        )
        self.detector_hand = mp_vision.HandLandmarker.create_from_options(options_hand)
        
        # 2. Pose
        base_options_pose = mp_tasks.BaseOptions(model_asset_path=self.pose_model)
        options_pose = mp_vision.PoseLandmarkerOptions(
            base_options=base_options_pose,
            min_pose_detection_confidence=confidence,
            min_tracking_confidence=confidence,
            running_mode=mp_vision.RunningMode.IMAGE
        )
        self.detector_pose = mp_vision.PoseLandmarker.create_from_options(options_pose)

        # 3. Face
        base_options_face = mp_tasks.BaseOptions(model_asset_path=self.face_model)
        options_face = mp_vision.FaceLandmarkerOptions(
            base_options=base_options_face,
            min_face_detection_confidence=confidence,
            min_face_presence_confidence=confidence,
            min_tracking_confidence=confidence,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1,
            running_mode=mp_vision.RunningMode.IMAGE
        )
        self.detector_face = mp_vision.FaceLandmarker.create_from_options(options_face)

    def extract_frame(self, frame: np.ndarray) -> Optional[List[List[float]]]:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # --- HANDS (42 points) ---
        hand_result = self.detector_hand.detect(mp_image)
        hands_data = [[0.0, 0.0, 0.0] for _ in range(42)]
        
        left_done, right_done = False, False
        for i, hand_landmarks in enumerate(hand_result.hand_landmarks):
            if i >= len(hand_result.handedness): break
            label = hand_result.handedness[i][0].category_name
            
            coords = [[lm.x, lm.y, lm.z] for lm in hand_landmarks]
            
            if label == 'Left' and not left_done:
                for j in range(min(21, len(coords))): hands_data[j] = coords[j]
                left_done = True
            elif label == 'Right' and not right_done:
                for j in range(min(21, len(coords))): hands_data[21 + j] = coords[j]
                right_done = True

        # --- POSE (33 points) ---
        pose_result = self.detector_pose.detect(mp_image)
        pose_data = [[0.0, 0.0, 0.0] for _ in range(33)]
        if pose_result.pose_landmarks:
            # Pose landmarks is a list of lists (usually 1 body)
            pl = pose_result.pose_landmarks[0]
            pose_data = [[lm.x, lm.y, lm.z] for lm in pl]

        # --- FACE (468 points) ---
        face_result = self.detector_face.detect(mp_image)
        face_data = [[0.0, 0.0, 0.0] for _ in range(468)]
        if face_result.face_landmarks:
            # Face landmarks is a list of lists (num_faces)
            fl = face_result.face_landmarks[0]
            face_data = [[lm.x, lm.y, lm.z] for lm in fl]

        # --- FUSION ---
        # Structure: Hands (42) + Pose (33) + Face (468) = 543 points
        full_vector = hands_data + pose_data + face_data
        
        # Check integrity - if everything is zero, return None to skip frame
        # Optimization: Just check first point of each modality
        h_active = any(c != 0 for c in hands_data[0]) or any(c != 0 for c in hands_data[21])
        p_active = any(c != 0 for c in pose_data[0])
        f_active = any(c != 0 for c in face_data[0])
        
        if not (h_active or p_active or f_active):
            return None

        return full_vector

    def process_video(self, video_path: str, gesture_name: str, max_frames: int, frame_skip: int) -> List[Dict[str, Any]]:
        print(f"Processing {os.path.basename(video_path)}...")
        cap = cv2.VideoCapture(video_path)
        samples = []
        frame_count = 0
        
        while frame_count < max_frames:
            ret, frame = cap.read()
            if not ret: break
            frame_count += 1
            if frame_count % frame_skip != 0: continue
            
            landmarks = self.extract_frame(frame)
            if landmarks:
                samples.append({
                    "label": gesture_name,
                    "landmarks": landmarks,
                    "frame_number": frame_count,
                    "video_source": os.path.basename(video_path)
                })
        
        cap.release()
        return samples

    def process_directory(self, videos_dir: str, max_frames: int, frame_skip: int) -> List[Dict[str, Any]]:
        all_samples = []
        # Basic mapping - in production use a DB or manifest
        video_gesture_map = {
            'alle.mp4': 'alle', 'blau.mp4': 'blau', 'rot.mp4': 'rot',
            'gelb.mp4': 'gelb', 'gruen.mp4': 'gruen', 'essen.mp4': 'essen',
            'trinken.mp4': 'trinken', 'satt.mp4': 'satt', 'spielen.mp4': 'spielen',
            'schwester.mp4': 'schwester', 'nochmal.mp4': 'nochmal', 'fertig.mp4': 'fertig'
        }
        
        files = [f for f in os.listdir(videos_dir) if f.endswith('.mp4')]
        for f in files:
            label = video_gesture_map.get(f)
            if label:
                path = os.path.join(videos_dir, f)
                all_samples.extend(self.process_video(path, label, max_frames, frame_skip))
            else:
                print(f"Skipping {f} (unknown label)")
                
        return all_samples

def save_output(samples: List[Dict[str, Any]], output_path: str, split_output: bool, videos_dir: str):
    # Bulk save
    if output_path:
        data = {"samples": [{"label": s["label"], "landmarks": s["landmarks"]} for s in samples]}
        with open(output_path, 'w') as f: json.dump(data, f)
        print(f"Saved bulk data to {output_path}")

    # Split save (for training manifest)
    if split_output:
        grouped = {}
        for s in samples:
            src = s.get("video_source")
            if src:
                if src not in grouped: grouped[src] = []
                grouped[src].append(s)
        
        for src, group in grouped.items():
            gesture = os.path.splitext(src)[0]
            out_file = os.path.join(videos_dir, f"{gesture}_landmarks.json")
            frames = [{"landmarks": s["landmarks"]} for s in group]
            with open(out_file, 'w') as f: json.dump({"frames": frames}, f)
            print(f"Updated {out_file}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--videos-dir', required=True)
    parser.add_argument('--output')
    parser.add_argument('--split-output', action='store_true')
    parser.add_argument('--models-dir', default='server/data/models')
    parser.add_argument('--max-frames', type=int, default=300)
    parser.add_argument('--frame-skip', type=int, default=2)
    args = parser.parse_args()

    processor = DGSVideoProcessor(args.models_dir)
    samples = processor.process_directory(args.videos_dir, args.max_frames, args.frame_skip)
    
    if samples:
        save_output(samples, args.output, args.split_output, args.videos_dir)
        print(f"Done. Processed {len(samples)} frames.")
    else:
        print("No samples found.")

if __name__ == "__main__":
    main()