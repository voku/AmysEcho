# Landmark Stream Payload Schema

This document defines the client payload used to stream live landmark frames to the app bridge. It establishes a versioned schema so clients and consumers can evolve safely.

## Versioning

- `schemaVersion`: Integer that identifies the payload shape.
- Current version: `1`.

## Payload Shape (Version 1)

```json
{
  "type": "landmarks",
  "schemaVersion": 1,
  "timestamp": 1715343012345,
  "landmarks": [
    [[0.52, 0.41, -0.02], [0.50, 0.39, -0.01]],
    [[0.33, 0.44, -0.03], [0.31, 0.42, -0.02]]
  ],
  "visibility": [
    [1, 1],
    [1, 1]
  ],
  "handednesses": ["Left", "Right"],
  "handedness": ["Left", "Right"]
}
```

### Field Definitions

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | string | ✅ | Always `"landmarks"`. |
| `schemaVersion` | number | ✅ | Current version is `1`. |
| `timestamp` | number | ✅ | Epoch milliseconds for when the frame was captured. |
| `landmarks` | number[][][] | ✅ | Hand landmarks in `[hand][point][x,y,z]` order. Coordinates are normalized to `[0..1]` for x/y; z is model-relative. |
| `visibility` | number[][] | ✅ | Visibility per hand landmark in `[hand][point]` order. Version 1 uses `1` for present points and `0` for missing points. |
| `handednesses` | string[] | ✅ | Human-readable handedness labels (e.g., `Left`, `Right`). |

## Notes

- The stream payload currently focuses on hand landmarks for real-time previews. Pose and face landmarks are captured in training bundles but are not part of the live stream yet.
- Consumers should ignore unknown fields and treat missing optional fields as empty arrays.
- For normalization formulas used in the client pipeline, see `docs/training/LANDMARK_NORMALIZATION.md`.
- For the planned recognition response payload, see `docs/training/RECOGNITION_RESPONSE_FORMAT.md`.

## Confidence Policy (Client)

The client applies a visibility policy before streaming frames:

- A hand must include at least 6 visible points.
- Visible point ratio per hand must be at least 0.25.
- At least one hand must meet these thresholds before a frame is streamed.

## Training Bundle Capture Context (MAY-P1-1)

In addition to the live stream payload, training bundle `metadata.json` may
include `captureContext` so signer/device/camera/lighting quality signals are
preserved through ingestion and training analysis.

```json
{
  "captureContext": {
    "signer": {
      "signerId": "amy-main",
      "dominantHand": "right",
      "ageGroup": "child"
    },
    "device": {
      "deviceModel": "iPad13,4",
      "platform": "ios",
      "osVersion": "17.5",
      "appVersion": "1.2.3"
    },
    "camera": {
      "facingMode": "user",
      "width": 1280,
      "height": 720,
      "fps": 30
    },
    "lighting": {
      "condition": "mixed",
      "confidence": 0.82,
      "source": "auto"
    }
  }
}
```

Allowed enum values:

- `signer.dominantHand`: `left | right | both | unknown`
- `signer.ageGroup`: `child | teen | adult | unknown`
- `camera.facingMode`: `user | environment | left | right | unknown`
- `lighting.condition`: `low | mixed | bright | backlit | unknown`
- `lighting.source`: `manual | auto | unknown`
