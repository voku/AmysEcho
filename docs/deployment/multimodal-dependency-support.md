# Multimodal dependency support

This repository already ships the pieces required to capture and transport multimodal DGS data (hands, pose, face landmarks plus handedness/features) without additional npm packages.

## Client capture
- The web client dynamically loads the MediaPipe Tasks Vision bundle (which includes hands, pose, and face models) from pinned CDN URLs so the browser receives all landmark modalities at runtime; no local dependency is required besides network access.
- MediaPipe results are normalized into hands + handedness + pose + face arrays and then filtered with a One Euro smoother before being routed into the rest of the capture and recording pipeline.
- Captured frames persist the full multimodal payload (hand landmarks, pose landmarks, face landmarks, handedness, and derived feature metrics) inside `landmarks.json` within each training bundle.

## Server ingestion
- The server’s bundle ingestor accepts the richer bundle format and normalizes every modality with bounds (max hands/points for hands, pose, and face) plus numeric feature sanitation before writing dataset samples.

## What this means
- As long as the CDN-hosted `@mediapipe/tasks-vision` assets remain reachable, the current setup supports multimodal capture, visualization, bundling, and ingestion without extra dependencies.
- No additional Node packages are needed for multimodal handling; MediaPipe is fetched at runtime in the browser, and the server treats the data as structured JSON.
