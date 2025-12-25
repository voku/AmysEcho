#!/usr/bin/env python3
"""Debug MediaPipe landmark extraction issues"""

import cv2
import sys
import numpy as np
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).parent / "src"))

try:
    import mediapipe as mp
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision as mp_vision
    
    print(f"MediaPipe version: {mp.__version__}")
    print(f"Tasks API available: {mp_tasks is not None}")
    print(f"Vision API available: {mp_vision is not None}")
    
    # Test the first DGS video
    video_path = Path(__file__).parent / "data" / "dgs_video_examples" / "gelb.mp4"
    print(f"Testing video: {video_path}")
    print(f"Video exists: {video_path.exists()}")
    
    if not video_path.exists():
        print("Video file not found!")
        sys.exit(1)
    
    cap = cv2.VideoCapture(str(video_path))
    
    if not cap.isOpened():
        print("Failed to open video!")
        sys.exit(1)
    
    print("Video opened successfully")
    
    # Get video info
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video info: {width}x{height}, {fps} FPS, {frame_count} frames")
    
    # Read frames with stride
    for frame_num in range(0, min(100, frame_count), 10):
        # Set frame position
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        success, frame = cap.read()
        if not success:
            break
            
        print(f"\n--- Frame {frame_num} ---")
        print(f"Frame shape: {frame.shape}")
        
        # Convert to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Check if model exists
        model_path = Path(__file__).parent / "data" / "models" / "hand_landmarker.task"
        print(f"Hand model exists: {model_path.exists()}")
        
        if not model_path.exists():
            print("Hand model not found!")
            continue
            
        # Try MediaPipe detection
        try:
            base_options = mp_tasks.BaseOptions(model_asset_path=str(model_path))
            options = mp_vision.HandLandmarkerOptions(
                base_options=base_options,
                num_hands=2,
                running_mode=mp_vision.RunningMode.IMAGE
            )
            
            with mp_vision.HandLandmarker.create_from_options(options) as landmarker:
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                result = landmarker.detect(mp_image)
                
                print(f"Hand landmarks detected: {len(result.hand_landmarks) if result.hand_landmarks else 0}")
                
                if result.hand_landmarks:
                    for i, hand_lms in enumerate(result.hand_landmarks):
                        print(f"Hand {i+1}: {len(hand_lms)} landmarks")
                        if len(hand_lms) > 0:
                            sample = hand_lms[0]
                            print(f"  Sample landmark: x={sample.x:.3f}, y={sample.y:.3f}, z={sample.z:.3f}")
                            
                            # Check if landmarks are reasonable (not all zeros)
                            x_coords = [lm.x for lm in hand_lms]
                            y_coords = [lm.y for lm in hand_lms]
                            z_coords = [lm.z for lm in hand_lms]
                            
                            print(f"  X range: [{min(x_coords):.3f}, {max(x_coords):.3f}]")
                            print(f"  Y range: [{min(y_coords):.3f}, {max(y_coords):.3f}]")  
                            print(f"  Z range: [{min(z_coords):.3f}, {max(z_coords):.3f}]")
                            
                            # Check if all zeros
                            if all(abs(x) < 0.001 for x in x_coords):
                                print("  ⚠️  WARNING: All X coordinates are near zero!")
                            if all(abs(y) < 0.001 for y in y_coords):
                                print("  ⚠️  WARNING: All Y coordinates are near zero!")
                else:
                    print("No hands detected")
                    
        except Exception as e:
            print(f"Error in MediaPipe detection: {e}")
            import traceback
            traceback.print_exc()
            break
    
    cap.release()
    print("\nDebug complete.")
    
except ImportError as e:
    print(f"Import error: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
    import traceback
    traceback.print_exc()