import sys
import json
import base64
import numpy as np
import cv2
import mediapipe as mp
from typing import Any, Dict, List

def _try_tasks_recognizer(rgb) -> Dict[str, Any]:
    """
    Try to run MediaPipe Tasks GestureRecognizer if a .task model is available.
    Returns dict with keys: result {label, confidence}, landmarks (normalized list),
    landmarks_px (pixel coords), image_size {width, height}.
    Raises on hard failures so caller can fallback.
    """
    import os
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    # Resolve potential model path candidates
    candidates = [
        os.environ.get('GESTURE_TASK_PATH') or '',
        os.path.join(os.path.dirname(__file__), 'models', 'gesture_recognizer.task'),
        os.path.join(os.path.dirname(__file__), '../../models/gesture_recognizer.task'),
        os.path.join(os.getcwd(), 'server', 'models', 'gesture_recognizer.task'),
    ]
    model_path = next((p for p in candidates if p and os.path.exists(p)), None)
    if not model_path:
        raise FileNotFoundError('gesture_recognizer.task not found')

    base_options = python.BaseOptions(model_asset_path=model_path)
    options = vision.GestureRecognizerOptions(base_options=base_options)
    recognizer = vision.GestureRecognizer.create_from_options(options)

    # Build an MP Image from numpy RGB
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = recognizer.recognize(mp_image)
    h, w, _ = rgb.shape

    # Landmarks: take first hand (if any)
    lms: List[List[float]] = []
    if result and result.hand_landmarks and len(result.hand_landmarks) > 0:
        lms = [[lm.x, lm.y, getattr(lm, 'z', 0.0)] for lm in result.hand_landmarks[0]]

    # Label: take highest scoring category
    label = 'uncertain'
    confidence = 0.0
    if result and result.gestures and len(result.gestures) > 0:
        top = result.gestures[0][0]
        label = top.category_name or 'uncertain'
        confidence = float(top.score or 0.0)

    lms_px = [[lm[0] * w, lm[1] * h, lm[2]] for lm in lms]
    # Handedness (Left/Right) and full gesture categories if present
    handed = None
    categories = []
    try:
        if result and result.handedness and len(result.handedness) > 0:
            top_h = result.handedness[0][0]
            handed = getattr(top_h, 'category_name', None)
        if result and result.gestures and len(result.gestures) > 0:
            for c in result.gestures[0]:
                categories.append({
                    'name': getattr(c, 'category_name', None),
                    'score': float(getattr(c, 'score', 0.0)),
                })
    except Exception:
        pass
    return {
        'result': {'label': label, 'confidence': round(confidence, 3)},
        'landmarks': lms,
        'landmarks_px': lms_px,
        'image_size': {'width': w, 'height': h},
        'handedness': handed,
        'categories': categories,
    }


def _decode_base64_to_rgb(base64_image_string):
    image_data = base64.b64decode(base64_image_string)
    np_arr = np.frombuffer(image_data, np.uint8)
    bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise RuntimeError("Failed to decode image")
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return rgb


def _heuristic_label(landmarks):
    # Simple heuristic: sum of distances from fingertips to wrist
    # MediaPipe indexes: 0 wrist; fingertips: 4, 8, 12, 16, 20 (normalized 0..1)
    try:
        wrist = landmarks[0]
        fingertips = [landmarks[i] for i in [4, 8, 12, 16, 20] if i < len(landmarks)]
        def dist(a, b):
            dx = a[0] - b[0]
            dy = a[1] - b[1]
            return (dx*dx + dy*dy) ** 0.5
        total = sum(dist(wrist, tip) for tip in fingertips)
        # Very rough thresholds tuned experimentally; adjust as needed
        # Larger sum => open hand; smaller => closed fist
        if total >= 1.8:
            conf = min(1.0, (total - 1.6) / 1.0)
            return {"label": "open_hand", "confidence": round(conf, 3)}
        else:
            conf = min(1.0, (1.8 - total) / 1.0)
            return {"label": "fist", "confidence": round(conf, 3)}
    except Exception:
        return {"label": "uncertain", "confidence": 0.0}


def recognize(base64_image_string):
    try:
        rgb = _decode_base64_to_rgb(base64_image_string)
        h, w, _ = rgb.shape

        # Prefer Tasks API if model is available
        try:
            data = _try_tasks_recognizer(rgb)
            return json.dumps(data)
        except Exception:
            pass

        # Fallback: classic Solutions Hands + heuristic label
        mp_hands = mp.solutions.hands
        with mp_hands.Hands(
            static_image_mode=True,
            max_num_hands=1,
            min_detection_confidence=0.5
        ) as hands:
            results = hands.process(rgb)

            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    lm = [[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark]
                    result = _heuristic_label(lm)
                    lms_px = [[p[0] * w, p[1] * h, p[2]] for p in lm]
                    return json.dumps({
                        "result": result,
                        "landmarks": lm,
                        "landmarks_px": lms_px,
                        "image_size": {"width": w, "height": h},
                        "handedness": None,
                        "categories": [],
                    })
            # no hands
            return json.dumps({
                "result": {"label": "no_hand", "confidence": 0.0},
                "landmarks": [],
                "landmarks_px": [],
                "image_size": {"width": w, "height": h},
                "handedness": None,
                "categories": [],
            })
    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(recognize(sys.argv[1]))
    else:
        print(json.dumps({"error": "No image data provided."}))
