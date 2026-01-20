# MediaPipe Deep Dive for Sign-Language Detection

## Why MediaPipe is a fit
MediaPipe’s docs now live on developers.google.com, but the repo still captures the high-level goals: it targets on-device ML across mobile, web, desktop, edge devices, and IoT, and its Solutions/Tasks include vision features suitable for real-time sign-language UX. The repo README also calls out setup guides for Android, web apps, and Python, which map to our app + server split.

## App-side (client) opportunities we likely missed
### 1) Hand-first pipeline (most important signal for sign language)
* MediaPipe Hands infers **21 3D hand landmarks** in real time from RGB frames. This is the main signal for finger spelling and lexical signs, and provides per-landmark `(x, y, z)` coordinates suitable for temporal modeling (e.g., RNN/Transformer sequence model). The doc explicitly calls out sign-language understanding as a primary use case.
* Practical client actions:
  * Capture the per-frame 21×3 landmark stream, normalize by hand size, and send compact landmark sequences to the server instead of full frames.
  * Use handedness + landmark visibility to gate low-confidence frames before server inference.

### 2) Holistic pipeline to capture non-manual markers
* MediaPipe Holistic fuses **pose + face + hands** to produce a unified, semantically consistent result. It’s explicitly cited as enabling gesture control **and sign language recognition**.
* The pipeline yields **540+ total landmarks**, using pose to find ROIs for face and hands and then running higher-resolution face/hand landmark models. This is ideal for capturing non-manual markers (facial expressions, head tilt, shoulder posture) that are essential in many sign languages.
* Practical client actions:
  * If device budget allows, use Holistic instead of standalone hands to capture non-manual markers. Otherwise, run Hands + Face Mesh and track head/face cues separately.

### 3) Face Mesh for facial expressions
* Face Mesh estimates **468 3D face landmarks** and has a Face Transform module to compute a 3D face pose transform. Facial expression, brow movement, and lip patterns are important grammatical markers for sign languages.
* Practical client actions:
  * Use face landmarks to drive expression features (brow raise, mouth shape, head pitch/yaw) and merge with hand features.

### 4) Pose Landmarks for upper-body context
* MediaPipe Pose tracks **33 3D landmarks** for the whole body and mentions sign-language recognition and full-body gesture control as use cases. Upper-body posture changes are part of many signs.
* Practical client actions:
  * Use shoulder/elbow/wrist/chest landmarks for body-relative normalization and to disambiguate similar hand shapes in different signing spaces.

## Server-side opportunities we likely missed
### 1) Use MediaPipe’s graph model for server pipelines
* MediaPipe processes data through **graphs** of **nodes (calculators)** connected by **streams** and **side packets**. This is a natural fit for a server pipeline that ingests landmark packets, applies temporal smoothing, runs classification, and emits results.
* Practical server actions:
  * Build a lightweight MediaPipe graph (or a graph-inspired pipeline) where calculators handle: pre-processing → temporal windowing → model inference → post-processing (language model) → output.

### 2) Split compute cleanly between app and server
* MediaPipe docs emphasize streaming inputs/outputs and clear separation of graph inputs/outputs. We can keep heavy inference on the server while the client streams compact landmark packets rather than raw video.
* Practical server actions:
  * Accept JSON or binary protobuf landmark streams (timestamps + arrays) and run a sequence model. Send back gloss + confidence + alignment timestamps.

### 3) Latency/robustness improvements
* Holistic’s pipeline uses pose landmarks to locate hand/face ROIs and re-detect as needed. The same idea can be mirrored in server inference: if landmarks are missing or low confidence, fall back to a detector or ask client for a re-init frame.

## Implementation checklist (actionable)
1. **Client capture**
   * Start with Hands for MVP; add Holistic when device GPU allows.
   * Serialize per-frame landmarks + visibility + handedness + timestamps.
2. **Server inference**
   * Window the landmark stream (e.g., 1–2s sliding windows).
   * Run a gesture classifier + language model (CTC/Transformer) on the sequence.
3. **Feedback loop**
   * Return per-token timestamps for on-screen highlights.
   * Capture low-confidence windows for active learning.

## Sources
* MediaPipe README (overview, setup guide links, and documentation migration).
* MediaPipe Hands (21 3D hand landmarks; sign-language use case).
* MediaPipe Holistic (pose+face+hands; sign-language use case; 540+ landmarks).
* MediaPipe Face Mesh (468 3D face landmarks; face transform).
* MediaPipe Pose (33 3D landmarks; sign-language use case).
* MediaPipe framework concepts (graphs, calculators, streams, side packets).

## Command log (research)
* `curl -L -s https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/README.md | head -n 40`
* `curl -L -s https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/docs/solutions/hands.md | head -n 40`
* `curl -L -s https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/docs/solutions/holistic.md | head -n 80`
* `curl -L -s https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/docs/solutions/pose.md | head -n 80`
* `curl -L -s https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/docs/solutions/face_mesh.md | head -n 80`
* `curl -L -s https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/docs/framework_concepts/framework_concepts.md | head -n 80`
* `curl -L -s https://api.github.com/repos/google-ai-edge/mediapipe/contents/docs | head -n 40`
