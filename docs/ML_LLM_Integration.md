# Sign Language Recognition in Amy's Echo

Amy's Echo is a Deutsche Gebärdensprache (DGS / German Sign Language) recognition system for non-verbal children. This document explains the machine-learning stack so new contributors can understand the sign language detection and training flow.

## 🤚 Sign Language Recognition Pipeline

### MediaPipe Hand Landmarks
- **Location**: `app/src/components/MediaPipeGestureDetector.tsx`
- **Role**: Runs inside a WebView to stream camera frames, extract 21×2 hand landmarks per hand, and emit metadata to the React Native side.
- **Output**: Hand pose landmarks that capture the shape and position of DGS signs
- **Performance Target**: ≤30 ms per frame on mid-range Android hardware.

### Amy's Sign Language MLP Classifier
- **Weights**: Downloaded through `app/src/services/dgsModelClient.ts` and injected with `useModelInjection`.
- **Inference**: Executed directly in the WebView bundle (`app/webview/gestureDetector.ts`) so sign recognition stays on-device and works offline.
- **Confidence Logic**: `app/src/screens/RecognitionScreen.tsx` interprets the WebView payload, stabilizes the landmarks, and drives UI/feedback decisions.
- **Vocabulary**: Trained on Deutsche Gebärdensprache (DGS) signs, with support for both baseline vocabulary and per-user custom signs

There is no secondary cloud validator anymore; all confidence handling happens locally. When confidence drops below thresholds the UI invites caregivers to provide more training examples instead of calling an external API.

## 🔄 Sign Language Training & Distribution Loop

1. **Capture** – `app/src/screens/TrainingScreen.tsx` records labeled DGS sign demonstrations plus the landmark timeline from MediaPipe.
2. **Bundle Upload** – `app/src/services/trainingBundleService.ts` zips `{metadata.json, landmarks.json, clip.mp4}` and sends it to `/api/v1/dgs/sample-bundles`.
3. **Server Ingest** – `server/src/routes/trainingBundleRoute.ts` validates uploads, expands them under `server/data/uploads/`, and registers entries in `data/datasets/training_manifest.json`.
4. **Training Jobs** – `server/src/server.ts` and `server/src/amyserver_tools/train_mlp.py` retrain the global + per-profile MLP weights for DGS recognition, writing artifacts into `data/models/`.
5. **Distribution** – the app polls `/latest-mlp-model` (optionally with `?profileId=`) and hot-swaps weights through the injection hook, enabling immediate recognition of newly trained signs.

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
- **MLP inference**: <20 ms (WebView JavaScript for DGS classification)
- **End-to-end loop**: <500 ms from frame to spoken feedback
- **Training cadence**: whenever caregivers upload sign bundles or trigger `/train-model`
- **Model distribution**: automatic download when new version available

## 🎯 Sign Language Training Quality (TODO)
**Open Item**: Establish criteria for promoting user-contributed training data to the global baseline model:
- Minimum sample count per DGS sign (e.g., 10+ examples from 3+ different users)
- Quality thresholds for landmark consistency and confidence
- Diversity requirements (different users, lighting conditions, camera angles)
- Review/approval workflow for baseline model updates

## 📝 Developer Notes
- No API keys are required for sign language recognition. Ensure `EXPO_PUBLIC_API_URL` points at your server when testing uploads.
- Server tests expect `python3` plus NumPy/MediaPipe dependencies for `train_mlp.py`. Use `npm test --prefix server` to compile TS before running Pytest.
- When editing the WebView classifier (`app/webview/gestureDetector.ts`) run `npm run build:webview --prefix app` so `app/assets/gestureDetector.js` stays in sync.

This architecture keeps the Deutsche Gebärdensprache (DGS) recognition loop fully within our control: MediaPipe handles hand pose perception, the MLP captures Amy's sign language vocabulary (both global and personalized), and the server distributes updated weights to every device automatically.
