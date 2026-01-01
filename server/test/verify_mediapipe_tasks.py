try:
    import mediapipe as mp  # noqa: F401
    from mediapipe.tasks.python.vision import (
        FaceLandmarker,  # noqa: F401
        FaceLandmarkerOptions,  # noqa: F401
        HandLandmarker,  # noqa: F401
        HandLandmarkerOptions,  # noqa: F401
        PoseLandmarker,  # noqa: F401
        PoseLandmarkerOptions,  # noqa: F401
    )
    print("✅ All MediaPipe Task classes found.")
except ImportError as e:
    print(f"❌ ImportError: {e}")
except Exception as e:
    print(f"❌ Error: {e}")
