try:
    import mediapipe as mp
    from mediapipe.tasks.python.vision import (
        FaceLandmarker,
        FaceLandmarkerOptions,
        HandLandmarker,
        HandLandmarkerOptions,
        PoseLandmarker,
        PoseLandmarkerOptions,
    )
    print("✅ All MediaPipe Task classes found.")
except ImportError as e:
    print(f"❌ ImportError: {e}")
except Exception as e:
    print(f"❌ Error: {e}")
