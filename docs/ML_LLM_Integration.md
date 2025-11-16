# ML Integration in Amy's Echo

Amy's Echo now relies entirely on our own gesture models. This document explains the current machine-learning stack so new contributors can follow the data flow without chasing obsolete third-party integrations.

## 🤖 Gesture Recognition

### MediaPipe Hand Landmarks
- **Location**: `app/src/components/MediaPipeGestureDetector.tsx`
- **Role**: Runs inside a WebView to stream camera frames, extract 21×2 hand landmarks, and emit metadata to the React Native side.
- **Performance Target**: ≤30 ms per frame on mid-range Android hardware.

### Amy's MLP Classifier
- **Weights**: Downloaded through `app/src/services/dgsModelClient.ts` and injected with `useModelInjection`.
- **Inference**: Executed directly in the WebView bundle (`app/webview/gestureDetector.ts`) so predictions stay on-device and work offline.
- **Confidence Logic**: `app/src/screens/RecognitionScreen.tsx` interprets the WebView payload, stabilizes the landmarks, and drives UI/feedback decisions.

There is no secondary cloud validator anymore; all confidence handling happens locally. When confidence drops below thresholds the UI invites caregivers to label the gesture instead of calling an external API.

## 🔄 Training & Distribution Loop
1. **Capture** – `app/src/screens/TrainingScreen.tsx` records labeled clips plus the landmark timeline.
2. **Bundle Upload** – `app/src/services/trainingBundleService.ts` zips `{metadata.json, landmarks.json, clip.mp4}` and sends it to `/api/v1/dgs/sample-bundles`.
3. **Server Ingest** – `server/src/routes/trainingBundleRoute.ts` validates uploads, expands them under `server/data/uploads/`, and registers entries in `data/datasets/training_manifest.json`.
4. **Training Jobs** – `server/src/server.ts` and `server/src/amyserver_tools/train_mlp.py` retrain the global + per-profile MLP weights, writing artifacts into `data/models/`.
5. **Distribution** – the app polls `/latest-mlp-model` (optionally with `?profileId=`) and hot-swaps weights through the injection hook.

## 🧠 Dialog & LLM Features (Archived)
The earlier GPT-based dialog experiments remain documented in `app/src/services/dialogEngine.ts`, but they are disabled by default. Future work can revive the feature by wiring a different backend or on-device model without reintroducing external vision services.

## 🔁 Runtime Pipeline
```
Camera → MediaPipe (landmarks) → MLP inference → RecognitionScreen state → Feedback & training hooks
```

## 📊 Key Metrics
- **Landmark extraction**: <30 ms
- **MLP inference**: <20 ms (WebView JavaScript)
- **End-to-end loop**: <500 ms from frame to spoken feedback
- **Training cadence**: whenever caregivers upload bundles or trigger `/train-model`

## 📝 Developer Notes
- No API keys are required for gesture recognition. Ensure `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_API_TOKEN` point at your server when testing uploads.
- Server tests expect `python3` plus NumPy/MediaPipe dependencies for `train_mlp.py`. Use `npm test --prefix server` to compile TS before running Pytest.
- When editing the WebView classifier (`app/webview/gestureDetector.ts`) run `npm run build:webview --prefix app` so `app/assets/gestureDetector.js` stays in sync.

This lean architecture keeps the gesture loop fully within our control: MediaPipe handles perception, the MLP captures Amy's vocabulary, and the server distributes updated weights to every device.
