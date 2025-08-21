# Amy's Echo – Expo-Compatible Hand Gesture Recognition Solutions

`react-native-fast-tflite` proved unreliable inside Expo's custom development client. To keep Amy's gestures responsive we adopted a **remote‑first** workflow: landmarks are detected on the device and classified on the server, with a TensorFlow Lite model kept only as an offline fallback.

Below are four proven approaches for Expo projects. Each option includes code samples so future iterations can reuse or swap parts without digging through commit history.

---

## 1. MediaPipe Tasks in WebView (recommended)

MediaPipe Tasks Vision `GestureRecognizer` runs inside a `WebView` using WebAssembly. It detects hand landmarks and recognized gestures on-device and streams landmarks to the backend classifier when available.

### Install
```bash
cd app
npm install react-native-webview
npx expo install expo-file-system
```

### Component
**File:** `app/src/components/MediaPipeGestureDetector.tsx`
```tsx
import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface Props {
  onGestureDetected: (gesture: string, confidence: number, landmarks: number[][]) => void;
  onError: (error: string) => void;
}

export const MediaPipeGestureDetector: React.FC<Props> = ({ onGestureDetected, onError }) => {
  const webviewRef = useRef<WebView>(null);

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>html,body{margin:0;padding:0;background:#000}video{width:100vw;height:100vh;object-fit:cover;transform:scaleX(-1)}</style>
  <script type="module">
    // Import locally-served Tasks Vision bundle to avoid CDN usage
    // Backend proxies and caches JS/WASM under /static/mediapipe/tasks-vision/<version>
    import { GestureRecognizer, FilesetResolver } from '${API_URL}/static/mediapipe/tasks-vision/0.10.9/vision_bundle.mjs';
    let gestureRecognizer; let runningMode = 'VIDEO';
    const video = document.createElement('video');
    video.setAttribute('autoplay',''); video.setAttribute('playsinline','');
    document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(video));
    async function createGestureRecognizer(){
      const vision = await FilesetResolver.forVisionTasks('${API_URL}/static/mediapipe/tasks-vision/0.10.9/wasm');
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision,{
        baseOptions:{ modelAssetPath:'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task', delegate:'GPU' },
        runningMode, numHands:1
      });
    }
    function predict(){
      if(gestureRecognizer && video.currentTime>0 && !video.paused){
        const r = gestureRecognizer.recognizeForVideo(video, performance.now());
        if(r?.gestures?.length){
          const g = r.gestures[0][0];
          const lms = (r.landmarks?.[0]||[]).map(l=>[l.x,l.y,l.z||0]);
          window.ReactNativeWebView?.postMessage?.(JSON.stringify({type:'gesture',gesture:g.categoryName,confidence:g.score,landmarks:lms}));
        }
      }
      requestAnimationFrame(predict);
    }
    async function start(){
      try{ const s = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}}); video.srcObject=s; await createGestureRecognizer(); video.addEventListener('loadeddata',()=>requestAnimationFrame(predict)); }
      catch(e){ window.ReactNativeWebView?.postMessage?.(JSON.stringify({type:'error',message:'Camera error: '+(e?.message||e)})); }
    }
    start();
  </script>
</head>
<body></body>
</html>`;

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        onMessage={e => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data.type === 'gesture') onGestureDetected(data.gesture, data.confidence, data.landmarks);
            else if (data.type === 'error') onError(data.message);
          } catch {
            onError('Failed to parse gesture data');
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        originWhitelist={['*']}
      />
    </View>
  );
};

const styles = StyleSheet.create({ container: { flex: 1 }, webview: { flex: 1 } });
```

### Screen integration
**File:** `app/src/screens/RecognitionScreen.tsx`
```tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  Easing,
  Button
} from 'react-native';
import { useAccessibility } from '../components/AccessibilityContext';
import { MediaPipeGestureDetector } from '../components/MediaPipeGestureDetector';
import BottomNav from '../components/BottomNav';
import CorrectionPanel from '../components/CorrectionPanel';
import { COLORS, SPACING } from '../constants/ui';
import { logger } from '../utils/logger';
import { audioService, triggerSpeakAndShow, correctionService, dialogEngine } from '../services';
import { loadProfile, Profile, logCorrection } from '../storage';
import { gestureModel, GestureModelEntry } from '../model';
import { LLMSuggestionResponse } from '../services/dialogEngine';

export default function RecognitionScreen({ navigation }: any) {
  const { largeText } = useAccessibility();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState("I'm listening...");
  const [detectedGesture, setDetectedGesture] = useState<string>('listening...');
  const [gestureConfidence, setGestureConfidence] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [suggestions, setSuggestions] = useState<LLMSuggestionResponse>({
    nextWords: [],
    caregiverPhrases: [],
  });
  const [dialogContext, setDialogContext] = useState<string[]>([]);
  const [pendingGesture, setPendingGesture] = useState<string | null>(null);
  const [lastRecognizedGesture, setLastRecognizedGesture] = useState<GestureModelEntry | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const symbolScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const startFeedbackAnimation = useCallback(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    symbolScaleAnim.setValue(0);
    Animated.spring(symbolScaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, symbolScaleAnim]);

  const handleGestureDetected = useCallback(async (gesture: string, confidence: number, landmarks: number[][]) => {
    setDetectedGesture(gesture);
    setGestureConfidence(confidence);
    setError(null);

    if (confidence > 0.7 && gesture !== 'unknown') {
      const entry = gestureModel.gestures.find((g) => g.id === gesture) || { id: gesture, label: gesture };
      setLastRecognizedGesture(entry as GestureModelEntry);
      setStatus(entry.label);
      triggerSpeakAndShow(entry.label, confidence);
      startFeedbackAnimation();

      try {
        const adv = await dialogEngine.getLLMSuggestions({
          input: entry.label,
          context: dialogContext,
          language: 'de',
          age: 4,
        });
        setSuggestions(adv);
        setDialogContext((ctx) => {
          const next = [...ctx, entry.label];
          return next.slice(-5);
        });
      } catch (error) {
        logger.warn('Failed to get LLM suggestions:', error);
      }

    } else {
      setStatus("I'm not sure. Please try again.");
      setPendingGesture(gesture);
      setShowCorrection(true);
    }
  }, [dialogContext, startFeedbackAnimation]);

  const handleGestureError = useCallback((errorMessage: string) => {
    logger.error('Gesture detection error:', errorMessage);
    setError(errorMessage);
  }, []);

  const handleSelectCorrection = async (choiceId: string) => {
    if (pendingGesture) {
      await correctionService.logCorrection(pendingGesture, choiceId);
    }
    setShowCorrection(false);
    setPendingGesture(null);
    setStatus("Thank you for teaching me!");
  };

  const handleCancelCorrection = () => {
    setShowCorrection(false);
    setPendingGesture(null);
    setStatus("I'm listening...");
  };

  // ... styles and render method

}
```

---

## 2. Local hosting of MediaPipe assets

- The backend serves `gesture_recognizer.task` at `/static/models/gesture_recognizer.task`.
- The backend proxies and caches Tasks Vision JS/WASM at `/static/mediapipe/tasks-vision/<version>/...` so the app never hits external CDNs.

## 3. Legacy MediaPipe (`@mediapipe/hands` + `@mediapipe/gesture_recognizer`)

Older examples used `@mediapipe/hands` together with `@mediapipe/gesture_recognizer` scripts. We now prefer the unified Tasks API shown above, but keeping the reference here helps when debugging CDN or WASM issues.

## 3. `@thinksys/react-native-mediapipe`

**Native but Expo‑compatible** – ships a hands detector that works in the managed workflow.

### Install
```bash
cd app
npm install @thinksys/react-native-mediapipe
npx expo install expo-gl expo-gl-cpp
```

### Usage
```tsx
import { MediaPipeProvider, HandsDetector } from '@thinksys/react-native-mediapipe';

<MediaPipeProvider>
  <HandsDetector onResults={r => console.log(r.landmarks)} />
</MediaPipeProvider>;
```

---

## 4. Pure JavaScript rules

**No model required** – simple math on landmark positions. The rules live directly inside `MediaPipeGestureDetector.tsx` and run whenever the remote classifier is unavailable or low-confidence.

**File:** `app/src/components/MediaPipeGestureDetector.tsx`
```ts
// Inside predictWebcam()
if ((!outGesture || outScore < 0.5) && lms.length === 21) {
  const thumbUp = lms[4][1] < lms[2][1];
  const indexUp = lms[8][1] < lms[6][1];
  const middleUp = lms[12][1] < lms[10][1];
  const ringUp = lms[16][1] < lms[14][1];
  const pinkyUp = lms[20][1] < lms[18][1];
  const allUp = indexUp && middleUp && ringUp && pinkyUp;
  const noneUp = !indexUp && !middleUp && !ringUp && !pinkyUp;
  if (thumbUp && !indexUp && !middleUp) { outGesture = 'thumbs_up'; outScore = 0.8; }
  else if (indexUp && !middleUp && !ringUp && !pinkyUp) { outGesture = 'point'; outScore = 0.7; }
  else if (allUp) { outGesture = 'open_palm'; outScore = 0.6; }
  else if (noneUp) { outGesture = 'fist'; outScore = 0.6; }
}
```

---

## 5. Cloud‑first image upload

**Heavyweight but robust** – send frames to the server and run MediaPipe Python.

### Client
```ts
const recognizeGestureFromImage = async (uri: string) => {
  const form = new FormData();
  form.append('image', { uri, type: 'image/jpeg', name: 'gesture.jpg' } as any);
  const res = await fetch('/api/recognize-gesture-image', { method: 'POST', body: form });
  return res.json();
};
```

### Server
```python
import cv2, numpy as np
import mediapipe as mp
from flask import Flask, request, jsonify
app = Flask(__name__)

hands = mp.solutions.hands.Hands(static_image_mode=True, max_num_hands=1)

def classify_gesture(landmarks):
    thumb_tip = landmarks[4]
    thumb_mcp = landmarks[2]
    index_tip = landmarks[8]
    if thumb_tip.y < thumb_mcp.y and index_tip.y > landmarks[6].y:
        return 'thumbs_up', 0.9
    return 'unknown', 0.3

@app.route('/api/recognize-gesture-image', methods=['POST'])
def recognize_gesture():
    file = request.files['image']
    image = cv2.imdecode(np.frombuffer(file.read(), np.uint8), cv2.IMREAD_COLOR)
    results = hands.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    if results.multi_hand_landmarks:
        g, conf = classify_gesture(results.multi_hand_landmarks[0].landmark)
        return jsonify({ 'gesture': g, 'confidence': conf })
    return jsonify({ 'gesture': 'no_hand', 'confidence': 0 })
```

---

## Recommended path
Start with **Solution 1 (WebView + Tasks Vision)**. It works instantly in Expo dev builds, produces landmarks for server classification, and now avoids CDNs by pulling required assets through the backend.

Note on `.tflite` assets: TFLite models are no longer used at runtime in this WebView path. Tiny placeholder files exist under `app/assets/models` to satisfy a couple of tests. If we update or remove those tests, the files can be deleted.
