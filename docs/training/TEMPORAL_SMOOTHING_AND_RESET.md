# Temporal Smoothing & Re-init Logic (Planned)

This document defines the planned server-side smoothing and re-initialization logic for streamed landmarks.

## Temporal Smoothing

**Goal:** reduce jitter while preserving fast motion for sign transitions.

**Planned approach:**

- Apply a lightweight exponential moving average (EMA) per landmark point.
- Maintain a short per-session buffer (last 3–5 frames) to compute a smoothed point.
- Reset smoothing state when a re-init trigger occurs (see below).

**Defaults (planned):**

- `alpha = 0.6` for hand landmarks
- `alpha = 0.4` for pose landmarks
- `alpha = 0.3` for face landmarks

Higher alpha keeps the newest frame more prominent (lower latency).

## Re-init Logic

**Goal:** avoid drift when confidence or modality coverage drops.

**Triggers:**

- Hand coverage < 0.5 for 5 consecutive frames
- Visibility ratio < 0.25 for all detected hands
- Timestamp gap > 300ms (camera stall)

**Actions:**

- Clear smoothing buffers
- Request a keyframe from the client (first full frame with hands + pose + face)
- Mark the next prediction window as "unstable" until a keyframe is received

## Telemetry

Track the following per session:

- `smoothedFrames`
- `reinitCount`
- `reinitReason`
- `avgVisibility`
- `coverageHands` / `coveragePose` / `coverageFace`

## Notes

This is a planning doc; implementation will live in the server streaming pipeline once live inference is enabled.
