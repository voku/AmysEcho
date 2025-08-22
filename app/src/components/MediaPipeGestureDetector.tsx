import React, { useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { API_URL, API_TOKEN, ANALYTICS_TELEMETRY_ENDPOINT } from '../constants';

interface Props {
  onGestureDetected: (
    gesture: string,
    confidence: number,
    landmarks: number[][][],
  ) => void;
  onError: (error: string) => void;
}

// Optional require to avoid crashing when native WebView module is not in the binary
let WebViewImpl: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewImpl = require('react-native-webview').WebView;
} catch (e) {
  WebViewImpl = null;
}

export const MediaPipeGestureDetector: React.FC<Props> = ({ onGestureDetected, onError }) => {
  const webviewRef = useRef<any>(null);

  if (!WebViewImpl) {
    // Provide a non-crashing fallback with a clear developer hint
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text accessibilityRole="alert" style={{ textAlign: 'center' }}>
          WebView unavailable. Build the development client including react-native-webview.
          {'\n'}Run: expo run:android (or npm run android --prefix app)
        </Text>
      </View>
    );
  }

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
    video.setAttribute('muted', '');
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(video);
    });

    async function createGestureRecognizer() {
      try {
        const visionStart = performance.now();
        const vision = await FilesetResolver.forVisionTasks(
          "${API_URL}/static/mediapipe/tasks-vision/0.10.9/wasm"
        );
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "${API_URL}/static/models/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode,
          numHands: 2,
        });
        const initMs = Math.round(performance.now() - visionStart);
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'recognizer_init', ms: initMs }));
        // Start prediction loop after recognizer is created and video is loaded
        video.addEventListener('loadeddata', predictWebcam);
      } catch (e) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'warn', message: 'Init failed, switching to server: ' + (e?.message || e) }));
        startServerFallback();
      }
    }

    let lastVideoTime = -1; // Added for performance optimization
    let frameCount = 0;
    function predictWebcam() {
      try {
        if (gestureRecognizer && video.currentTime > 0 && !video.paused && !video.ended) {
          if (lastVideoTime !== video.currentTime) { // Only process if video frame has changed
            lastVideoTime = video.currentTime;
            const start = performance.now();
            const results = gestureRecognizer.recognizeForVideo(video, start);
            const frameLatency = Math.round(performance.now() - start);
            frameCount++;
            if (frameCount % 30 === 0) {
              window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'frame_latency', ms: frameLatency }));
            }
            const allLandmarks = (results?.landmarks || []).map(hand =>
              hand.map(lm => [lm.x, lm.y, lm.z ?? 0])
            );
            let outGesture = null;
            let outScore = 0;
            if (results?.gestures?.length) {
              for (const handGestures of results.gestures) {
                const top = handGestures?.[0];
                if (top && top.score > outScore) {
                  outGesture = top.categoryName;
                  outScore = top.score;
                }
              }
            }
            // Custom gesture logic (preserved for single-hand fallback)
            const firstHand = allLandmarks[0] || [];
            if ((!outGesture || outScore < 0.5) && firstHand.length === 21) {
              const thumbUp = firstHand[4][1] < firstHand[2][1];
              const indexUp = firstHand[8][1] < firstHand[6][1];
              const middleUp = firstHand[12][1] < firstHand[10][1];
              const ringUp = firstHand[16][1] < firstHand[14][1];
              const pinkyUp = firstHand[20][1] < firstHand[18][1];
              const allUp = indexUp && middleUp && ringUp && pinkyUp;
              const noneUp = !indexUp && !middleUp && !ringUp && !pinkyUp;
              if (thumbUp && !indexUp && !middleUp) {
                outGesture = 'thumbs_up';
                outScore = 0.8;
              } else if (indexUp && !middleUp && !ringUp && !pinkyUp) {
                outGesture = 'point';
                outScore = 0.7;
              } else if (allUp) {
                outGesture = 'open_palm';
                outScore = 0.6;
              } else if (noneUp) {
                outGesture = 'fist';
                outScore = 0.6;
              }
            }
            if (outGesture) {
              window.ReactNativeWebView?.postMessage?.(
                JSON.stringify({
                  type: 'gesture',
                  gesture: outGesture,
                  confidence: outScore,
                  landmarks: allLandmarks,
                }),
              );
            }
          }
        }
      } catch (e) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'warn', message: 'Prediction error: ' + (e?.message || e) }));
      }
      window.requestAnimationFrame(predictWebcam);
    }

    // Fallback: capture frames and send to server for recognition (preserved)
    let serverTimer;
    async function startServerFallback() {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'server_fallback', ms: 0 }));
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
              // normalize landmarks to always be number[][][]
              let lms = Array.isArray(result?.landmarks?.[0]?.[0])
                ? result.landmarks
                : [result.landmarks || []];
              window.ReactNativeWebView?.postMessage?.(
                JSON.stringify({ type: 'gesture', gesture: g, confidence: conf, landmarks: lms }),
              );
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

    async function startCamera() { // Renamed from start() for clarity
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        video.srcObject = stream;
        try { video.muted = true; await video.play(); } catch {}
        // createGestureRecognizer will add the loadeddata listener
      } catch (err) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: 'Camera error: ' + (err?.message || err) }));
      }
    }

    // Start camera and then create recognizer
    startCamera();
    createGestureRecognizer();
  </script>
</head>
<body></body>
</html>`;

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'gesture') {
        onGestureDetected(data.gesture, data.confidence, data.landmarks);
      } else if (data.type === 'error') {
        onError(data.message);
      } else if (data.type === 'warn') {
        // Optionally forward warning to analytics if needed
      } else if (data.type === 'telemetry') {
        try {
          await fetch(ANALYTICS_TELEMETRY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_TOKEN}` },
            body: JSON.stringify({
              latencyMs: typeof data.ms === 'number' ? data.ms : 0,
              timestamp: Date.now(),
              event: data.event || 'unknown',
              source: 'webview-gesture-detector',
            }),
          });
        } catch {
          // ignore telemetry failures
        }
      }
    } catch (error) {
      onError('Failed to parse gesture data');
    }
  };

  return (
    <View style={styles.container}>
      <WebViewImpl
        ref={webviewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        onMessage={handleMessage}
        mediaPlaybackRequiresUserAction={false}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        originWhitelist={['*']}
        // On Android, auto-grant media capture permissions if app holds CAMERA
        mediaCapturePermissionGrantType={'grant'}
        androidLayerType={'hardware'}
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
