# Sign Language Recognition in Amy's Echo

Amy's Echo is a Deutsche Gebärdensprache (DGS / German Sign Language) recognition system for non-verbal children. This document explains the machine-learning stack so new contributors can understand the sign language detection and training flow.

## 🤚 Sign Language Recognition Pipeline

### MediaPipe Hand Landmarks
- **Location**: `webapp/src/gesture/core/GestureDetector.ts`
- **Role**: Runs in the webapp to stream camera frames, extract hand landmarks (plus pose/face when available), and emit metadata to the recognition pipeline.
- **Output**: Hand pose landmarks that capture the shape and position of DGS signs
- **Performance Target**: ≤30 ms per frame on mid-range Android hardware.

### Amy's Sign Language MLP Classifier
- **Weights**: Downloaded through `webapp/src/gesture/modelClient.ts` and injected with `webapp/src/hooks/useMlpModelInjection.ts`.
- **Inference**: Executed directly in the webapp (see `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`) so sign recognition stays on-device and works offline.
- **Confidence Logic**: `webapp/src/components/SignLanguageRecorder.tsx` interprets recognizer output, stabilizes the landmarks, and drives UI/feedback decisions.
- **Vocabulary**: Trained on Deutsche Gebärdensprache (DGS) signs, with support for both baseline vocabulary and per-user custom signs

There is no secondary cloud validator anymore; all confidence handling happens locally. When confidence drops below thresholds the UI invites caregivers to provide more training examples instead of calling an external API.

## 🔄 Sign Language Training & Distribution Loop

1. **Capture** – `webapp/src/components/TrainingRecorder.tsx` and `webapp/src/hooks/useTrainingRecorder.ts` record labeled DGS sign demonstrations plus the landmark timeline from MediaPipe.
2. **Bundle Upload** – `webapp/src/training/trainingBundle.ts` zips `{metadata.json, landmarks.json, still.jpg, clip.*}` and sends it to `/api/v1/dgs/sample-bundles`.
3. **Server Ingest** – `server/src/routes/trainingBundleRoute.ts` validates uploads, expands them under `server/data/uploads/`, and registers entries in `data/datasets/training_manifest.json`.
4. **Training Jobs** – `server/src/server.ts` and `server/src/amyserver_tools/train_mlp.py` retrain the global + per-profile MLP weights for DGS recognition, writing artifacts into `data/models/`.
5. **Distribution** – the app polls `/api/v1/models/latest` (optionally with `?profileId=`) and hot-swaps weights through the injection hook, enabling immediate recognition of newly trained signs.

### Per-User and Global Models
- **Global Model** (`data/models/global/amy_model.npz`): Baseline DGS vocabulary that all users can recognize
- **Per-Profile Models** (`data/models/<profileId>/amy_model.npz`): Personalized models trained on each child's specific sign variations and custom signs
- **Auto-Download**: Webapp automatically downloads and activates the latest model version for the current profile

## 🧠 Dialog & LLM Features (Removed)
The experimental GPT dialog layer was fully removed to concentrate on the sign language training loop. No dialog-specific code remains in the app or server, and reintroducing the concept would require a fresh architecture review.

## 🔁 Runtime Pipeline
```
Camera → MediaPipe (hand landmarks) → MLP inference (DGS recognition) → RecognitionScreen state → Feedback & training hooks
```

## 📊 Key Metrics
- **Landmark extraction**: <30 ms (MediaPipe hand tracking)
- **MLP inference**: <20 ms (Webapp JavaScript for DGS classification)
- **End-to-end loop**: <500 ms from frame to spoken feedback
- **Training cadence**: whenever caregivers upload sign bundles or trigger `/api/v1/train-model`
- **Model distribution**: automatic download when new version available

## 🎯 Sign Language Training Quality
Roadmap items for training data quality gates are consolidated in [`docs/planning/todo.md`](../planning/todo.md).

## 📝 Developer Notes
- No API keys are required for sign language recognition. Ensure `VITE_API_URL` points at your server when testing uploads.
- Server tests expect `python3` plus NumPy/MediaPipe dependencies for `train_mlp.py`. Use `npm test --prefix server` to compile TS before running Pytest.
- When editing the gesture pipeline in `webapp/src/gesture/`, run the webapp test suite to ensure recognition and training flows stay aligned.

This architecture keeps the Deutsche Gebärdensprache (DGS) recognition loop fully within our control: MediaPipe handles hand pose perception, the MLP captures Amy's sign language vocabulary (both global and personalized), and the server distributes updated weights to every device automatically.
