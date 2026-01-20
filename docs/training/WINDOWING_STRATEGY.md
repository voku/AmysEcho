# Windowing Strategy for Landmark Sequences

This document defines how landmark sequences are chunked into windows for recognition and training. The goal is to produce stable, low-latency predictions while preserving alignment between frames and gloss tokens.

## Defaults (Planned)

- **Window length:** 32 frames (≈1.0s at 30 FPS)
- **Stride:** 8 frames (≈0.27s)
- **Padding:** zero-pad missing frames when the window is shorter than the target length
- **Alignment:** CTC-style alignment for token timing, with per-token start/end offsets derived from the most confident frame span

These defaults balance responsiveness (short stride) with enough temporal context to capture two-handed gestures and non-manual cues.

## Rationale

- **Latency:** A 32-frame window keeps inference latency below ~50ms on modern devices while retaining context for multi-part signs.
- **Stability:** Overlapping windows (stride 8) smooths predictions and reduces flicker.
- **Alignment:** CTC alignment provides per-token timing without requiring full-sequence decoding.

## Implementation Notes

- Windows are built on the server from streamed frames; each frame includes `timestampMs` so token timing is reported in real time.
- The client can pre-chunk windows for offline inference if needed, using the same length/stride settings.
- The server should expose the windowing settings in response metadata for telemetry and debugging.

## Telemetry

Record these metrics per window:

- `windowLengthFrames`
- `strideFrames`
- `observedFps`
- `droppedFrames`
- `latencyMs`

## Future Extensions

- Adaptive window length based on gesture speed (shorter for fast motions, longer for complex signs).
- Dynamic stride based on device thermal state or FPS drops.
