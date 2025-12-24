#!/usr/bin/env python3
"""
Update individual landmark files in server/data/dgs_video_examples
using the fixed MediaPipe Tasks extraction logic.
"""

import os
import json
import sys
from process_dgs_videos import DGSVideoProcessor

def update_individual_files(data_dir, models_dir, max_frames=300, frame_skip=2, confidence=0.5):
    print(f"Updating files in {data_dir} using models from {models_dir}")
    
    if not os.path.exists(data_dir):
        print(f"Directory {data_dir} does not exist")
        return

    # Initialize processor
    try:
        processor = DGSVideoProcessor(models_dir=models_dir, confidence=confidence)
    except Exception as e:
        print(f"Failed to initialize processor: {e}")
        return
    
    files = [f for f in os.listdir(data_dir) if f.endswith(".mp4")]
    
    for video_file in files:
        video_path = os.path.join(data_dir, video_file)
        # gestures are usually the filename without extension
        gesture = os.path.splitext(video_file)[0]
        
        print(f"Processing {gesture}...")
        samples = processor.process_video(video_path, gesture, max_frames, frame_skip)
        
        if not samples:
            print(f"  Warning: No samples extracted for {gesture}")
            continue
            
        # Convert to expected format: { "frames": [ { "landmarks": [...] } ] }
        frames_out = []
        for sample in samples:
            frames_out.append({
                "landmarks": sample["landmarks"]
            })
            
        output_json = os.path.join(data_dir, f"{gesture}_landmarks.json")
        
        with open(output_json, "w") as f:
            json.dump({"frames": frames_out}, f, indent=2)
            
        print(f"  Wrote {len(frames_out)} frames to {output_json}")

if __name__ == "__main__":
    # Run from project root
    data_dir = "server/data/dgs_video_examples"
    models_dir = "server/data/models"
    
    update_individual_files(data_dir, models_dir)
