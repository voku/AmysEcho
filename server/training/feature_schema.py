#!/usr/bin/env python3
"""Shared feature schema loader for multimodal landmark sizes."""

from __future__ import annotations

import json
from pathlib import Path


_ROOT = Path(__file__).resolve().parents[2]
_SCHEMA_PATH = _ROOT / "spec" / "feature_schema.json"


def load_feature_schema() -> dict:
    with _SCHEMA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


SCHEMA = load_feature_schema()

COORDINATES_PER_LANDMARK = int(SCHEMA["coordinatesPerLandmark"])
HAND_LANDMARKS_PER_HAND = int(SCHEMA["landmarks"]["hands"]["perHand"])
TOTAL_HANDS = int(SCHEMA["landmarks"]["hands"]["totalHands"])
TOTAL_HAND_LANDMARKS = int(SCHEMA["landmarks"]["hands"]["points"])
POSE_LANDMARKS = int(SCHEMA["landmarks"]["pose"]["points"])
FACE_LANDMARKS = int(SCHEMA["landmarks"]["face"]["points"])

HAND_FEATURE_SIZE = int(SCHEMA["features"]["hand"])
POSE_FEATURE_SIZE = int(SCHEMA["features"]["pose"])
FACE_FEATURE_SIZE = int(SCHEMA["features"]["face"])
INPUT_FEATURE_SIZE = int(SCHEMA["features"]["multimodal"])

DEFAULT_WINDOW_SIZE = int(SCHEMA["windowSize"])
WINDOW_FEATURE_SIZE = int(SCHEMA["windowFeatureSize"])
