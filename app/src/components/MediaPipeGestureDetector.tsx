import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { API_URL, API_TOKEN } from '../constants';

interface Props {
  onGestureDetected: (gesture: string, confidence: number, landmarks: number[][]) => void;
  onError: (error: string) => void;
}

export const MediaPipeGestureDetector: React.FC<Props> = ({ onGestureDetected, onError }) => {
  const webviewRef = useRef<WebView>(null);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; background: #000; }
    video { width: 100vw; height: 100vh; object-fit: cover; transform: scaleX(-1); }
  </style>
  <script type="module">
    import { GestureRecognizer, FilesetResolver } from "${API_URL}/static/mediapipe/tasks-vision/0.10.9/vision_bundle.mjs";

    let gestureRecognizer;
    let runningMode = "VIDEO";
    const video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(video);
    });

    async function createGestureRecognizer() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "${API_URL}/static/mediapipe/tasks-vision/0.10.9/wasm"
        );
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "${API_URL}/static/models/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode,
          numHands: 1,
        });
      } catch (e) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'warn', message: 'Init failed, switching to server: ' + (e?.message || e) }));
        startServerFallback();
      }
    }

    function predictWebcam() {
      try {
        if (gestureRecognizer && video.currentTime > 0 && !video.paused && !video.ended) {
          const nowInMs = performance.now();
          const results = gestureRecognizer.recognizeForVideo(video, nowInMs);
          const lms = (results?.landmarks?.[0] || []).map(lm => [lm.x, lm.y, lm.z ?? 0]);
          let outGesture = null;
          let outScore = 0;
          if (results?.gestures?.length) {
            const top = results.gestures[0][0];
            outGesture = top.categoryName;
            outScore = top.score;
          }
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
          if (outGesture) {
            window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'gesture', gesture: outGesture, confidence: outScore, landmarks: lms }));
          }
        }
      } catch (e) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'warn', message: 'Prediction error: ' + (e?.message || e) }));
      }
      window.requestAnimationFrame(predictWebcam);
    }

    // Fallback: capture frames and send to server for recognition
    let serverTimer;
    async function startServerFallback() {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const sendFrame = async () => {
          if (!ctx || video.readyState < 2) return;
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          const base64 = dataUrl.split(',')[1] || '';
          try {
            const resp = await fetch('${API_URL}/api/v1/recognize-gesture', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${API_TOKEN}' },
              body: JSON.stringify({ image: base64 }),
            });
            if (resp.ok) {
              const result = await resp.json();
              const g = result?.gesture || 'unknown';
              const conf = result?.confidence ?? 0;
              const lms = Array.isArray(result?.landmarks) ? result.landmarks : [];
              window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'gesture', gesture: g, confidence: conf, landmarks: lms }));
            }
          } catch (e) {
            window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'warn', message: 'Server fallback error: ' + (e?.message || e) }));
          }
        };
        clearInterval(serverTimer);
        serverTimer = setInterval(sendFrame, 500);
      } catch (e) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: 'Fallback init error: ' + (e?.message || e) }));
      }
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        video.srcObject = stream;
        await createGestureRecognizer();
        video.addEventListener('loadeddata', () => {
          window.requestAnimationFrame(predictWebcam);
        });
      } catch (err) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: 'Camera error: ' + (err?.message || err) }));
      }
    }

    start();
  </script>
</head>
<body></body>
</html>`;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'gesture') {
        onGestureDetected(data.gesture, data.confidence, data.landmarks);
      } else if (data.type === 'error') {
        onError(data.message);
      }
    } catch (error) {
      onError('Failed to parse gesture data');
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        onMessage={handleMessage}
        mediaPlaybackRequiresUserAction={false}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        originWhitelist={['*']}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
