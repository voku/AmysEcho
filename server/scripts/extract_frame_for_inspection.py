#!/usr/bin/env python3
"""Visualize a frame from DGS video to see what MediaPipe is missing"""

from pathlib import Path

import cv2


def main():
    """Extract and save a frame from DGS video for visual inspection"""

    script_dir = Path(__file__).parent
    video_path = script_dir.parent / "data" / "dgs_video_examples" / "gelb.mp4"

    cap = cv2.VideoCapture(str(video_path))

    try:
        if not cap.isOpened():
            print("Failed to open video")
            return

        # Read first frame
        success, frame = cap.read()

        if success:
            # Save the frame as image for inspection
            artifact_dir = script_dir / "dev-artifacts"
            artifact_dir.mkdir(parents=True, exist_ok=True)

            output_path = artifact_dir / "gelb_frame_for_inspection.jpg"
            cv2.imwrite(str(output_path), frame)
            print(f"Saved frame to: {output_path}")
            print(f"Frame shape: {frame.shape}")
            print(f"Frame dtype: {frame.dtype}")
            print(f"Frame range: [{frame.min()}, {frame.max()}]")

            # Basic edge detection to see if there are contours
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            print(f"Found {len(contours)} contours")

            # Save edge detected version
            edge_path = artifact_dir / "gelb_frame_edges.jpg"
            cv2.imwrite(str(edge_path), edges)
            print(f"Saved edges to: {edge_path}")
        else:
            print("Failed to read frame")
    finally:
        cap.release()

if __name__ == "__main__":
    main()
