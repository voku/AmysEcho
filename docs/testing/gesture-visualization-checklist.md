# Gesture Visualization Inspection Checklist

Use this quick checklist during field testing to verify the hand, pose, and face overlay alignment and responsiveness across devices and orientations.

## Camera and Preview
- Device/back/front: Confirm back camera is preferred; front camera works with mirroring.
- Aspect-fit letterboxing: Landmarks stay centered inside visible preview; no drift into letterbox bars.
- Rotation: Rotate device 90°/180° and confirm overlay tracks correctly.

## Landmark Alignment
- Open palm: Joints and edges align finger tips and wrist without visible offset.
- Fist: Points cluster tightly; no stray points off the hand silhouette.
- Pointing: Index finger’s landmarks extend in the pointing direction; connections form a straight line.
- Multiple hands: If two hands detected, both sets render; connections do not cross incorrectly.

## Pose Overlay Alignment
- Upper body: Shoulder, elbow, and hip points stay anchored to the body during slow movement.
- Rotation: Turn 45°/90° and confirm the skeleton tracks without flipping left/right.
- Occlusion: Briefly cover one arm and confirm the overlay drops only the missing limb.

## Face Overlay Alignment
- Center points: Nose and eye landmarks stay centered on the face.
- Expression changes: Smile/frown and confirm the mesh moves smoothly with minimal jitter.
- Partial visibility: Move face toward edge of frame; mesh should clamp inside preview bounds.

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
- Hand/pose/face overlays track joints within ~1–2% of preview width/height.
- No drawing outside preview bounds.
- Mirroring correct on front camera.
- Metrics visible and updating during recognition.
