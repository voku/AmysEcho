# Server-Side Gesture Model Training Best Practices

This memo distills training-focused guidance for the Amy's Echo MLP trainer (`server/src/amyserver_tools/train_mlp.py`). It complements `docs/planning/TODO.md` and the existing training loop by tightening reliability, observability, and reproducibility.

## 1. Data & Preprocessing Discipline
- **Immutable bundle storage**: Keep uploads under `data/uploads/<profileId>/<timestamp>/` read-only post-ingest to avoid label drift.
- **Manifest validation**: Validate `training_manifest.json` entries before queuing training; require `landmarks.json` or cached `landmarks_cached.json`, reject path traversal, and flag missing `metadata.json` fields (gesture label, fps, duration).
- **Feature contract gating**: Reject bundles that explicitly declare a non-matching `metadata.featureContract.version` so outdated preprocessing cannot silently contaminate current models (`wrist_relative_max_abs_v1`).
- **Deterministic sampling**: Record the sampling strategy (frame stride, STILL_FRAME_WEIGHT) alongside each training run and seed RNGs (NumPy, Python) to make runs reproducible.
- **Feature normalization parity**: Persist the scaling parameters (e.g., landmark centering/normalization) used during training inside the model bundle so inference and retraining stay aligned.

## 2. Hyperparameters & Configuration
- **Centralize defaults**: Keep learning rate, hidden size, epochs, dropout, early-stopping patience, and batch size in one config block that can be overridden via environment variables for server deployments.
- **Profile-aware tuning**: Allow per-profile overrides (e.g., fewer epochs for tiny datasets) while keeping sane global minima to prevent overfitting.
- **Curriculum-friendly ordering**: When mixing stills and video frames, sort examples chronologically and start with stills to stabilize early gradients.

## 3. Training Loop Reliability
- **Dependency-aware defaults**: If MediaPipe/OpenCV are unavailable, skip uncached default example extraction in one fail-fast step instead of iterating every video with repeated warnings.
- **Warm start vs. cold start**: Detect whether `data/models/<profileId>/amy_model.npz` exists and warm-start from it; otherwise fall back to the global model to accelerate convergence.
- **Gradient clipping & NaN guards**: Clip gradients and check loss for NaN/inf each step; abort with a structured error event if encountered.
- **Early-stopping reporting**: Emit the patience counter and best validation loss at each epoch to make stopping decisions transparent.
- **Class balance handling**: Compute label distribution from the manifest and apply class weights or upsampling to avoid majority-class dominance.

## 4. Evaluation & QA
- **Hold-out splits per profile**: Reserve a portion of each profile's data for validation to avoid optimistic metrics when training personalized models.
- **Cross-profile sanity check**: After personalized training, evaluate on a small global validation set to ensure personalization does not regress global performance.
- **Metric consistency**: Log accuracy, F1, and loss for train/val; keep metric names stable so automation can parse them.

## 5. Observability & Audit Trails
- **Structured event sinks**: Persist `_emit_event` streams to `data/logs/train/<timestamp>/events.jsonl` and the final report to `report.json`; include the manifest hash and hyperparameters.
- **Checkpoint retention**: Save intermediate checkpoints (e.g., best val loss) and prune with a retention policy to aid post-mortems.
- **Resource telemetry**: Capture epoch-level wall time and sample throughput to detect slowdowns on specific nodes.

## 6. Safety, Security, and Privacy
- **Path safety**: Use `ensure_inside` and `resolve_relative_path` for every filesystem access derived from user uploads; never follow symlinks in `data/uploads`.
- **Content scanning**: Quarantine bundles with executable content or oversized media before training; log rejection reasons with enough detail for operators.
- **PII minimization**: Strip metadata that could leak identity (camera EXIF, uploader info) before persisting to training caches.

## 7. Scaling & Scheduling
- **Job isolation**: Run per-profile jobs in separate working directories to avoid cross-run contamination of temporary files.
- **Queue prioritization**: Prioritize bundles for profiles with recent interaction failures or low confidence scores to maximize user-visible impact.
- **Preemption awareness**: Make training resumable by checkpointing at epoch boundaries and handling SIGTERM gracefully on shared servers.

## 8. Reproducibility Checklist (per run)
- Model source (global vs. profile) and checksum
- Manifest hash and sample counts per label
- Hyperparameters and random seeds
- Feature normalization parameters
- Training/validation metrics per epoch
- Paths to checkpoints and final artifacts

## Next Steps
- Wire these practices into `train_mlp.py` and the `/train-model` handler: stricter manifest validation, seeded training, class balancing, richer event logging, and checkpoint management.
- Document operational steps for installing optional CV stacks (MediaPipe/OpenCV) and ensuring they are present on training nodes.
