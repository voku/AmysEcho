# Gesture Visualization Inspection Checklist

Use this quick checklist during field testing to verify the hand overlay alignment and responsiveness across devices and orientations.

## Camera and Preview
- Device/back/front: Confirm back camera is preferred; front camera works with mirroring.
- Aspect-fit letterboxing: Landmarks stay centered inside visible preview; no drift into letterbox bars.
- Rotation: Rotate device 90°/180° and confirm overlay tracks correctly.

## Landmark Alignment
- Open palm: Joints and edges align finger tips and wrist without visible offset.
- Fist: Points cluster tightly; no stray points off the hand silhouette.
- Pointing: Index finger’s landmarks extend in the pointing direction; connections form a straight line.
- Multiple hands: If two hands detected, both sets render; connections do not cross incorrectly.

## Mirroring (Front Camera)
- Left vs right: Move left hand—overlay moves to your right on screen (mirrored).
- Symmetry: Switch hands; overlay follows with consistent alignment.

## Stability and Clamping
- Edge of frame: Move hand to all edges; points do not draw outside the preview.
- Fast motion: Overlay lags minimally; no large jumps or flicker.

## Debug Overlay (Long‑Press Status)
- Toggle: Long‑press status banner to show metrics; long‑press again to hide.
- Metrics visible: FPS, queue depth, last latency, circuit breaker state, plugin used (yes/no), path (local/cloud).

## Pass Criteria
- Overlay tracks joints within ~1–2% of preview width/height.
- No drawing outside preview bounds.
- Mirroring correct on front camera.
- Metrics visible and updating during recognition.

