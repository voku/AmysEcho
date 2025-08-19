import sys
import json
import base64
import numpy as np
import cv2
import mediapipe as mp
from typing import Any, Dict, List
import os

DATASET_PATH = os.path.join(os.path.dirname(__file__), '../../data/dgs_samples.json')

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
                    payload = {
                        "result": result,
                        "landmarks": lm,
                        "landmarks_px": lms_px,
                        "image_size": {"width": w, "height": h},
                        "handedness": None,
                        "categories": [],
                    }
                    # Optional DGS classification from dataset
                    try:
                        dgs = classify_from_dataset(lm)
                        if dgs:
                            payload["dgs_label"] = dgs["label"]
                            payload["dgs_confidence"] = dgs["confidence"]
                    except Exception:
                        pass
                    return json.dumps(payload)
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

def _normalize(lm: List[List[float]]) -> List[List[float]]:
    # Wrist-center and scale by max distance to keep scale-invariant
    if not lm or len(lm) < 21:
        return lm
    wx, wy, wz = lm[0]
    pts = [[x - wx, y - wy, (z - wz) if z is not None else 0.0] for (x,y, z) in lm]
    maxd = max((abs(x) + abs(y)) for (x,y,_) in pts) or 1.0
    return [[x / maxd, y / maxd, z] for (x,y,z) in pts]

import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), '../../data/dgs_model.npz')

def _predict_mlp(q_flat, model):
    w1, b1, w2, b2, idx_to_label = model['w1'], model['b1'], model['w2'], model['b2'], model['idx_to_label'].item()
    
    def relu(x):
        return np.maximum(0, x)

    def softmax(x):
        e_x = np.exp(x - np.max(x))
        return e_x / e_x.sum()

    z1 = np.dot(q_flat, w1) + b1
    a1 = relu(z1)
    z2 = np.dot(a1, w2) + b2
    probs = softmax(z2)

    top_idx = np.argmax(probs)
    confidence = probs[0, top_idx]
    label = idx_to_label.get(top_idx, 'unknown')
    
    return {"label": label, "confidence": round(float(confidence), 3)}

def _predict_mlp(q_flat, model):
    w1, b1, w2, b2, idx_to_label = model['w1'], model['b1'], model['w2'], model['b2'], model['idx_to_label'].item()
    
    def relu(x):
        return np.maximum(0, x)

    def softmax(x):
        e_x = np.exp(x - np.max(x))
        return e_x / e_x.sum()

    z1 = np.dot(q_flat, w1) + b1
    a1 = relu(z1)
    z2 = np.dot(a1, w2) + b2
    probs = softmax(z2)

    # Apply bias from correction history
    bias_str = os.environ.get('AE_GESTURE_BIAS')
    if bias_str:
        try:
            bias_scores = json.loads(bias_str)
            if bias_scores:
                for label, score in bias_scores.items():
                    # Find the index for this label
                    try:
                        idx = list(idx_to_label.values()).index(label)
                        # Apply a gentle logarithmic bias
                        bias_factor = 1.0 + 0.1 * np.log1p(score)
                        probs[0, idx] *= bias_factor
                    except ValueError:
                        continue # Label from bias not in this model
                # Re-normalize probabilities after biasing
                probs /= np.sum(probs)
        except (json.JSONDecodeError, IndexError):
            pass # Ignore malformed bias string

    top_idx = np.argmax(probs)
    confidence = probs[0, top_idx]
    label = idx_to_label.get(top_idx, 'unknown')
    
    return {"label": label, "confidence": round(float(confidence), 3)}

def classify_from_dataset(lm: List[List[float]]):
    q = _normalize(lm)
    if q is None:
        return None

    # --- Try MLP first ---
    try:
        model = np.load(MODEL_PATH, allow_pickle=True)
        if model:
            return _predict_mlp(q, model)
    except FileNotFoundError:
        pass # Fallback to k-NN
    except Exception as e:
        print(f"MLP prediction failed: {e}") # Log error but still fallback

    # --- Fallback to k-NN ---
    try:
        with open(DATASET_PATH, 'r') as f:
            data = json.load(f)
    except Exception:
        return None
    samples = data.get('samples', [])
    if not samples:
        return None
    profile_id = os.environ.get('AE_PROFILE_ID') or ''
    
    # k-NN over samples with inverse-distance weighting and per-profile preference
    import math
    k = int(os.environ.get('AE_KNN_K') or '5')
    if k <= 0:
        k = 5
    # Collect distances to all samples
    neighbors = []  # (label, dist, weightFactor)
    for s in samples:
        lbl = s.get('label')
        lm_s = s.get('landmarks')
        if not isinstance(lbl, str) or not isinstance(lm_s, list) or len(lm_s) == 0:
            continue

        # If the sample is a sequence, use the middle frame for classification
        frame_to_classify = lm_s
        if lm_s and isinstance(lm_s[0], list) and isinstance(lm_s[0][0], list):
            frame_to_classify = lm_s[len(lm_s) // 2]

        a = _normalize(frame_to_classify)
        if a is None:
            continue
        
        # distance in XY only
        dist = np.linalg.norm(a - q)
        
        # Prefer profile-specific samples with a multiplier; globals get a lower factor
        pf = s.get('profileId')
        weight_factor = 1.0 if (profile_id and pf == profile_id) else 0.7 if not pf else 0.5
        neighbors.append((lbl, dist, weight_factor))
    if not neighbors:
        return None
    neighbors.sort(key=lambda x: x[1])
    use = neighbors[:max(1, min(k, len(neighbors)))]
    # Inverse-distance weighted vote
    scores = {}
    total = 0.0
    for lbl, dist, wf in use:
        w = wf * (1.0 / (1e-6 + dist))
        scores[lbl] = scores.get(lbl, 0.0) + w
        total += w

    # Apply bias from correction history
    bias_str = os.environ.get('AE_GESTURE_BIAS')
    if bias_str:
        try:
            bias_scores = json.loads(bias_str)
            for label, score in bias_scores.items():
                if label in scores:
                    bias_factor = 1.0 + 0.1 * np.log1p(score)
                    scores[label] *= bias_factor
        except (json.JSONDecodeError, IndexError):
            pass # Ignore malformed bias string

    # Re-calculate total for confidence after bias
    total = sum(scores.values())

    best_label = None
    best_score = -1.0
    for lbl, s in scores.items():
        if s > best_score:
            best_label = lbl
            best_score = s
    if best_label is None or total <= 0:
        return None
    conf = max(0.0, min(1.0, best_score / total))
    return {"label": best_label, "confidence": round(conf, 3)}


if __name__ == "__main__":
    try:
        if len(sys.argv) > 1:
            base64_input = sys.argv[1]
        else:
            # Read from stdin to avoid huge argv limits
            base64_input = sys.stdin.read().strip()
        if not base64_input:
            print(json.dumps({"error": "No image data provided."}))
        else:
            print(recognize(base64_input))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
