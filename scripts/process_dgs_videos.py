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

import argparse
import json
import os
import sys
from typing import Any

import cv2
import numpy as np

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

    def extract_frame(self, frame: np.ndarray) -> list[list[float]] | None:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # --- HANDS (42 points) ---
        hand_result = self.detector_hand.detect(mp_image)
        hands_data = [[0.0, 0.0, 0.0] for _ in range(42)]

        if len(hand_result.hand_landmarks) != len(hand_result.handedness):
            print(f"Warning: MediaPipe returned mismatched hands/handedness lengths: {len(hand_result.hand_landmarks)} vs {len(hand_result.handedness)}")

        left_done, right_done = False, False
        for hand_landmarks, handedness in zip(hand_result.hand_landmarks, hand_result.handedness, strict=True):
            label = handedness[0].category_name

            coords = [[lm.x, lm.y, lm.z] for lm in hand_landmarks]

            if label == 'Left' and not left_done:
                for j in range(min(21, len(coords))):
                    hands_data[j] = coords[j]
                left_done = True
            elif label == 'Right' and not right_done:
                for j in range(min(21, len(coords))):
                    hands_data[21 + j] = coords[j]
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

    def process_video(self, video_path: str, gesture_name: str, max_frames: int, frame_skip: int) -> list[dict[str, Any]]:
        video_name = os.path.basename(video_path)
        print(f"Processing {video_name} (gesture: {gesture_name})...")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"Error: Cannot open video file {video_path}")
            return []

        # Get video info
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        print(f"  Video info: {total_frames} total frames, {fps:.2f} FPS")

        samples = []
        frame_count = 0
        processed_frames = 0
        successful_extractions = 0

        while frame_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                print(f"  Reached end of video at frame {frame_count}")
                break

            frame_count += 1
            if frame_count % frame_skip != 0:
                continue

            processed_frames += 1
            landmarks = self.extract_frame(frame)
            if landmarks:
                successful_extractions += 1
                samples.append({
                    "label": gesture_name,
                    "landmarks": landmarks,
                    "frame_number": frame_count,
                    "video_source": video_name
                })

        cap.release()

        print(f"  Completed: {successful_extractions}/{processed_frames} frames successfully processed")
        return samples

    def load_video_gesture_mapping(self, manifest_path: str | None = None) -> dict[str, str]:
        """Load video-to-gesture mapping from manifest"""
        if manifest_path and os.path.exists(manifest_path):
            try:
                with open(manifest_path, encoding='utf-8') as f:
                    manifest_data = json.load(f)
                    mapping = {}
                    for gesture_info in manifest_data.get('gestures', []):
                        label = gesture_info.get('label')
                        videos = gesture_info.get('videos', [])
                        
                        # Handle old single-video format for backward compatibility
                        single_video = gesture_info.get('video')
                        if single_video:
                            mapping[single_video] = label
                            
                        # Handle new multi-video format
                        if isinstance(videos, list):
                            for v in videos:
                                mapping[v] = label
                                
                    print(f"Loaded {len(mapping)} video mappings for {len(manifest_data.get('gestures', []))} gestures from {manifest_path}")
                    return mapping
            except json.JSONDecodeError as e:
                print(f"Warning: Failed to parse manifest {manifest_path}: {e}")
            except OSError as e:
                print(f"Warning: Failed to load manifest {manifest_path}: {e}")

        return {}

    def process_directory(self, videos_dir: str, max_frames: int, frame_skip: int, manifest_path: str | None = None) -> list[dict[str, Any]]:
        # Validate directory exists first
        if not os.path.exists(videos_dir):
            print(f"Error: Videos directory {videos_dir} does not exist")
            return []

        if not os.path.isdir(videos_dir):
            print(f"Error: {videos_dir} is not a directory")
            return []

        all_samples = []
        # Load mapping from manifest or use fallback
        video_gesture_map = self.load_video_gesture_mapping(manifest_path)

        try:
            files = [f for f in os.listdir(videos_dir) if f.endswith('.mp4')]
            if not files:
                print(f"Warning: No MP4 files found in {videos_dir}")
                return []
        except OSError as e:
            print(f"Error: Cannot read directory {videos_dir}: {e}")
            return []

        successful_frames = 0

        for f in files:
            label = video_gesture_map.get(f)
            if label:
                path = os.path.join(videos_dir, f)
                if not os.path.exists(path):
                    print(f"Warning: Video file {path} does not exist, skipping")
                    continue

                video_samples = self.process_video(path, label, max_frames, frame_skip)
                all_samples.extend(video_samples)
                successful_frames += len(video_samples)
            else:
                print(f"Skipping {f} (unknown label)")

        print(f"Processed {len(files)} videos, extracted {successful_frames} landmark frames")
        return all_samples

def save_output(samples: list[dict[str, Any]], output_path: str, split_output: bool, videos_dir: str):
    # Bulk save
    if output_path:
        try:
            output_dir = os.path.dirname(output_path)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)

            data = {"samples": [{"label": s["label"], "landmarks": s["landmarks"]} for s in samples]}
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f)
            print(f"Saved bulk data to {output_path}")
        except OSError as e:
            print(f"Error: Failed to write bulk output to {output_path}: {e}")

    # Split save (for training manifest)
    if split_output:
        grouped = {}
        for s in samples:
            src = s.get("video_source")
            if src:
                if src not in grouped:
                    grouped[src] = []
                grouped[src].append(s)

        for src, group in grouped.items():
            gesture = os.path.splitext(src)[0]
            out_file = os.path.join(videos_dir, f"{gesture}_landmarks.json")
            try:
                frames = [{"landmarks": s["landmarks"]} for s in group]
                with open(out_file, 'w', encoding='utf-8') as f:
                    json.dump({"frames": frames}, f)
                print(f"Updated {out_file}")
            except OSError as e:
                print(f"Error: Failed to write {out_file}: {e}")

def main():
    parser = argparse.ArgumentParser(description="Process DGS videos to extract multimodal landmarks for training")
    parser.add_argument('--videos-dir', required=True, help='Directory containing DGS video files')
    parser.add_argument('--output', help='Output JSON file for bulk data')
    parser.add_argument('--split-output', action='store_true', help='Save individual landmark files per video')
    parser.add_argument('--models-dir', default='server/data/models', help='Directory containing MediaPipe model files')
    parser.add_argument('--manifest', default='server/data/dgs_manifest.json', help='JSON manifest with video-to-gesture mappings')
    parser.add_argument('--max-frames', type=int, default=300, help='Maximum frames to process per video')
    parser.add_argument('--frame-skip', type=int, default=2, help='Number of frames to skip between processing')
    parser.add_argument('--confidence', type=float, default=0.5, help='Detection confidence threshold')
    args = parser.parse_args()

    print("Starting DGS Video Processing...")
    print(f"Videos directory: {args.videos_dir}")
    print(f"Output file: {args.output}")
    print(f"Models directory: {args.models_dir}")
    print(f"Manifest file: {args.manifest}")
    print(f"Max frames: {args.max_frames}, Frame skip: {args.frame_skip}")
    print(f"Confidence threshold: {args.confidence}")

    try:
        # Validate models directory first
        if not os.path.exists(args.models_dir):
            raise FileNotFoundError(f"Models directory does not exist: {args.models_dir}")

        processor = DGSVideoProcessor(args.models_dir, args.confidence)
        samples = processor.process_directory(args.videos_dir, args.max_frames, args.frame_skip, args.manifest)

        if samples:
            save_output(samples, args.output, args.split_output, args.videos_dir)
            print(f"\nSuccess! Processed {len(samples)} landmark samples from videos.")
        else:
            print("Error: No samples were extracted from the videos.")
            sys.exit(1)

    except FileNotFoundError as e:
        print(f"Fatal Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Fatal Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
