import React, { useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { API_TOKEN, ANALYTICS_TELEMETRY_ENDPOINT } from '../constants';

interface Props {
  onGestureDetected: (
    gesture: string,
    confidence: number,
    landmarks: number[][][],
  ) => void;
  onError: (error: string) => void;
  onWebViewEvent?: (event: string) => void;
  facingMode?: 'user' | 'environment';
}

// Optional require to avoid crashing when native WebView module is not in the binary
let WebViewImpl: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewImpl = require('react-native-webview').WebView;
} catch (e) {
  WebViewImpl = null;
}

export const MediaPipeGestureDetector: React.FC<Props> = ({ onGestureDetected, onError, onWebViewEvent, facingMode = 'user' }) => {
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
    video { position: absolute; inset: 0; width: 100vw; height: 100vh; object-fit: cover; transform: scaleX(-1); }
    canvas#overlay { position: absolute; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
    #tapToStart { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(0,0,0,0.4); font-family: sans-serif; }
    #tapToStart.hidden { display: none; }
  </style>
  <script>
    // Dynamically load MediaPipe Tasks Vision from CDN and wait until it's ready
    async function loadTasksVision() {
      // Resolve a pinned version dynamically if possible, otherwise fall back to generic.
      async function resolvePinnedBase() {
        const cdns = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
        for (const base of cdns) {
          try {
            const pkg = await fetch(base + '/@mediapipe/tasks-vision/package.json', { method: 'GET' });
            if (pkg.ok) {
              const json = await pkg.json().catch(()=>null);
              const v = json?.version;
              if (typeof v === 'string' && v.length) {
                return { base, version: v };
              }
            }
          } catch {}
        }
        return null;
      }

      function tryLoadScript(src) {
        return new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = () => reject(new Error('Failed to load script: ' + src));
          document.head.appendChild(s);
        });
      }

      const haveUMD = () => (window.fileset_resolver && window.fileset_resolver.FilesetResolver) && (window.vision && window.vision.GestureRecognizer);

      // Compute preferred URLs
      const pinned = await resolvePinnedBase();
      const candidates = [];
      if (pinned) {
        candidates.push({
          umd: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.js',
          esm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/vision_bundle.mjs',
          wasm: pinned.base + '/@mediapipe/tasks-vision@' + pinned.version + '/wasm',
        });
      }
      // Generic latest as fallback
      candidates.push({
        umd: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js',
        esm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs',
        wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
      });
      candidates.push({
        umd: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.js',
        esm: 'https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs',
        wasm: 'https://unpkg.com/@mediapipe/tasks-vision/wasm',
      });

      let lastError = null;
      for (const c of candidates) {
        try {
          // Try UMD first
          if (!haveUMD()) {
            await tryLoadScript(c.umd);
          }
          if (haveUMD()) {
            return {
              FilesetResolver: window.fileset_resolver.FilesetResolver,
              GestureRecognizer: window.vision.GestureRecognizer,
              wasmBase: c.wasm,
            };
          }
          // Try ESM next
          try {
            const mod = await import(/* @vite-ignore */ c.esm);
            if (mod?.FilesetResolver && mod?.GestureRecognizer) {
              return { FilesetResolver: mod.FilesetResolver, GestureRecognizer: mod.GestureRecognizer, wasmBase: c.wasm };
            }
          } catch (e) { lastError = e; }
        } catch (e) { lastError = e; }
      }
      throw new Error('Tasks Vision globals not available' + (lastError ? (': ' + (lastError.message||lastError)) : ''));
    }
    let gestureRecognizer;
    let runningMode = "VIDEO";
    const video = document.createElement('video');
    const overlay = document.createElement('canvas');
    overlay.id = 'overlay';
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(video);
      document.body.appendChild(overlay);
      const tap = document.createElement('div');
      tap.id = 'tapToStart';
      tap.innerText = 'Tap to start camera';
      tap.addEventListener('click', async () => {
        try { await startCamera(); tap.classList.add('hidden'); window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type:'telemetry', event:'tap_start' })); } catch {}
      });
      document.body.appendChild(tap);
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'dom_ready' }));
    });

    async function createGestureRecognizer() {
      try {
        const visionStart = performance.now();
        const { FilesetResolver, GestureRecognizer, wasmBase } = await loadTasksVision();
        const vision = await FilesetResolver.forVisionTasks(wasmBase || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
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
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: 'Recognizer init failed: ' + (e?.message || e) }));
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
            const perHand = [];
            if (results?.gestures?.length) {
              for (let i=0; i<results.gestures.length; i++) {
                const handGestures = results.gestures[i] || [];
                const top = handGestures?.[0];
                const handed = (results?.handednesses?.[i]?.[0]?.categoryName) || 'unknown';
                if (top) {
                  perHand.push({ hand: handed, label: top.categoryName, score: top.score });
                  if (top.score > outScore) {
                    outGesture = top.categoryName;
                    outScore = top.score;
                  }
                }
              }
              if (perHand.length >= 2) {
                const left = perHand.find(h => /left/i.test(h.hand)) || perHand[0];
                const right = perHand.find(h => /right/i.test(h.hand)) || perHand[1];
                if (left && right) {
                  outGesture = `${left.label}+${right.label}`;
                  outScore = Math.min(left.score, right.score);
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
            // Draw overlay landmarks
            try {
              const w = video.clientWidth || window.innerWidth;
              const h = video.clientHeight || window.innerHeight;
              if (overlay.width !== w || overlay.height !== h) {
                overlay.width = w; overlay.height = h;
              }
              const ctx = overlay.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, overlay.width, overlay.height);
                ctx.save();
                // Mirror horizontally to match video
                ctx.scale(-1, 1);
                ctx.translate(-overlay.width, 0);
                const HAND_CONNECTIONS = [
                  [0,1],[1,2],[2,3],[3,4],
                  [0,5],[5,6],[6,7],[7,8],
                  [5,9],[9,10],[10,11],[11,12],
                  [9,13],[13,14],[14,15],[15,16],
                  [13,17],[17,18],[18,19],[19,20],
                  [0,17]
                ];
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
                ctx.fillStyle = 'rgba(0, 255, 180, 0.9)';
                for (const hand of (results?.landmarks || [])) {
                  // connectors
                  ctx.beginPath();
                  for (const [a,b] of HAND_CONNECTIONS) {
                    const pa = hand[a]; const pb = hand[b];
                    if (!pa || !pb) continue;
                    ctx.moveTo(pa.x * overlay.width, pa.y * overlay.height);
                    ctx.lineTo(pb.x * overlay.width, pb.y * overlay.height);
                  }
                  ctx.stroke();
                  // points
                  for (const lm of hand) {
                    ctx.beginPath();
                    ctx.arc(lm.x * overlay.width, lm.y * overlay.height, 4, 0, Math.PI*2);
                    ctx.fill();
                  }
                }
                ctx.restore();
              }
            } catch {}

            if (outGesture) {
              window.ReactNativeWebView?.postMessage?.(
                JSON.stringify({
                  type: 'gesture',
                  gesture: outGesture,
                  confidence: outScore,
                  landmarks: allLandmarks,
                  hands: perHand,
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

    // Note: server-based fallback removed; on-device recognition only

    function resizeOverlay() {
      try {
        const w = video.clientWidth || window.innerWidth;
        const h = video.clientHeight || window.innerHeight;
        if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
      } catch {}
    }

    async function startCamera() { // Renamed from start() for clarity
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: '${facingMode}', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        video.srcObject = stream;
        try { video.muted = true; await video.play(); resizeOverlay(); } catch {}
        const tracks = stream.getVideoTracks();
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'camera_started', tracks: tracks.map(t=>t.label) }));
        // createGestureRecognizer will add the loadeddata listener
      } catch (err) {
        const msg = (err && (err.name+': '+err.message)) || String(err);
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: 'Camera error: ' + msg }));
      }
    }

    // Start camera and then create recognizer
    startCamera();
    createGestureRecognizer();
    window.addEventListener('resize', ()=>{ try { resizeOverlay(); } catch {} });
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
        try { onWebViewEvent && onWebViewEvent(String(data.event || '')); } catch {}
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
        source={{ html: htmlContent, baseUrl: 'https://camera.local' }}
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
        mixedContentMode={'always'}
        onPermissionRequest={(event: any) => {
          try {
            // Grant all requested resources (VIDEO_CAPTURE/AUDIO_CAPTURE)
            event.nativeEvent.grant(event.nativeEvent.resources);
          } catch {}
        }}
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
