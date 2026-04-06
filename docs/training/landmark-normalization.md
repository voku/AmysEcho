# Landmark Normalization (Client)

This document describes the normalization applied to live and training landmarks on the client. The goal is to make landmark features scale- and body-position-invariant so the MLP classifier can generalize across children with different sizes and camera distances.

## Hand size normalization (streaming pipeline)

Hand size normalization runs inside the gesture processing pipeline to reduce scale drift between frames. The normalizer keeps a per-hand reference size and scales new frames relative to that reference.

### Reference size

- Measure the Euclidean distance between the wrist (index `0`) and the middle finger tip (index `12`).

```text
handSize = sqrt((x12 - x0)^2 + (y12 - y0)^2 + (z12 - z0)^2)
```

### Size ratio

```text
sizeRatio = handSize / referenceSize
```

If `|sizeRatio - 1| <= tolerance`, the hand is left unchanged. Otherwise the ratio is clamped to the configured scale bounds before applying normalization.

### Normalization formula

For every point `p = (x, y, z)` in the hand, using `w = (wx, wy, wz)` for the wrist position:

```text
normalized = w + (p - w) / clampedRatio
```

This scales landmarks relative to the wrist so the hand keeps its pose while matching the reference size.

Unit tests live in `webapp/src/gesture/__tests__/GestureProcessing.test.ts` and cover reference initialization, clamping, and multi-hand behavior.

## Hand landmark normalization (MLP inputs)

When preparing features for the MLP, each hand is translated to the wrist and scaled so the maximum absolute value across the entire flattened coordinate vector is `1`. This is the **canonical contract** used by both webapp inference and server training.

### Translation

```text
translated = point - wrist
```

### Scale (canonical: global max-abs)

```text
flat = flatten(translated)               # 63 values: x0,y0,z0,x1,y1,z1,...
maxAbs = max(|flat[i]|) for all i
normalized = flat / maxAbs               # all values in [-1, 1]
```

This ensures the full hand fits in a consistent normalized volume with a fixed `[-1, 1]` range.  
Canonical implementation: `webapp/src/training/landmarkFeatureContract.ts::normalizeHandLandmarksWristRelative`.  
Server mirror: `server/src/amyserver_tools/frame_normalization.py::_normalize_hand`.

> **Note**: `webapp/src/gesture/utils/landmarkNormalizer.ts::normalizeLandmarks` uses a **different** metric — `max(|x|+|y|+|z|)` per-point (max L1-per-point). That function is only used for the streaming hand-size template matcher (`landmarkTemplateDetector.ts`). It is **not** the canonical MLP normalization; do not use it when building training features or MLP inference features.

See `webapp/src/training/landmarkFeatureContract.test.ts` for canonical fixture tests.

## Pose normalization (body-relative coordinates)

Pose landmarks are normalized for MLP input by centering on the torso and scaling by shoulder width.

### Torso center

Use the average of left/right shoulders (indices 11, 12) and left/right hips (indices 23, 24):

```text
center = (LShoulder + RShoulder + LHip + RHip) / 4
```

### Scale

```text
shoulderWidth = distance(LShoulder, RShoulder)
normalized = (point - center) / max(shoulderWidth, 1)
```

This yields body-relative coordinates that are stable across camera distance. Covered by pose-related tests in `webapp/src/gesture/utils/__tests__/landmarkNormalizer.test.ts`.

## Face normalization (body-relative coordinates)

Face landmarks are normalized by centering on the nose tip (index `1`) and scaling by the distance between eyes (indices `33` and `263`).

```text
center = noseTip
scale = distance(leftEye, rightEye)
normalized = (point - center) / max(scale, 1)
```

This produces a face coordinate system that is consistent across scale. Covered by face-related tests in `webapp/src/gesture/utils/__tests__/landmarkNormalizer.test.ts`.
