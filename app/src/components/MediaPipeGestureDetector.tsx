import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
// Avoid pulling the module at import time. Use dynamic require below.
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';

interface Props {
  onGestureDetected: (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
  ) => void;
  onError: (error: string) => void;
  onWebViewEvent?: (telemetry: any) => void;
  facingMode?: 'user' | 'environment';
}

// Optional require to avoid crashing when native WebView module is not in the binary
let WebViewImpl: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewImpl = require('react-native-webview').WebView as unknown as React.ComponentType<any>;
} catch (e) {
  WebViewImpl = null;
}

export const MediaPipeGestureDetector: React.FC<Props> = ({ onGestureDetected, onError, onWebViewEvent, facingMode }) => {
  const webviewRef = useRef<any>(null);

  // HTML with MediaPipe gesture recognition
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #000;
      width: 100%;
      height: 100%;
      font-family: Arial, sans-serif;
      overflow: hidden;
    }
    #video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    #tapToStart {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 255, 0, 0.9);
      color: #000;
      padding: 20px 40px;
      font-size: 24px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      z-index: 1000;
    }
    #tapToStart.hidden {
      display: none;
    }
    #debug {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 5px 10px;
      font-size: 12px;
      border-radius: 5px;
      z-index: 1000;
    }
    #overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <video id="video" autoplay playsinline muted></video>
  <canvas id="overlay"></canvas>
  <button id="tapToStart">Tap to start camera</button>
  <div id="debug">WebView loaded</div>
   <script>
     // Extend window for MediaPipe globals
     window.fileset_resolver = window.fileset_resolver || {};
     window.vision = window.vision || {};
     // Pass facing mode from React Native
     window.facingMode = '${facingMode || 'user'}';

    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    const tapToStart = document.getElementById('tapToStart');
    const debug = document.getElementById('debug');

    let gestureRecognizer;
    let runningMode = "VIDEO";
    let lastVideoTime = -1;
    let frameCount = 0;
    let lastSentAt = 0;

    // Update debug info
    function updateDebug(msg) {
      debug.innerText = msg;
    }

    // Load MediaPipe Tasks Vision (modern ESM approach)
    async function loadTasksVision() {
      try {
        updateDebug('Loading MediaPipe via ESM...');

        // Check if already available
        if (typeof window.fileset_resolver !== 'undefined' &&
            typeof window.vision !== 'undefined' &&
            window.fileset_resolver.FilesetResolver &&
            window.vision.GestureRecognizer) {
          updateDebug('MediaPipe already available');
          createGestureRecognizer();
          return;
        }

        // Try ESM import approach
        try {
          updateDebug('Trying ESM import...');
          const module = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs');
          console.log('ESM import result:', module);

          // Set globals manually
          if (module.FilesetResolver) {
            window.fileset_resolver = { FilesetResolver: module.FilesetResolver };
          }
          if (module.GestureRecognizer) {
            window.vision = { GestureRecognizer: module.GestureRecognizer };
          }

          if (window.fileset_resolver && window.vision) {
            updateDebug('ESM globals set manually');
            createGestureRecognizer();
            return;
          }
        } catch (esmError) {
          updateDebug('ESM import failed: ' + esmError.message);
          console.log('ESM error:', esmError);
        }

        // Try dynamic script loading with different approaches
        const urls = [
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.js',
          'https://unpkg.com/@mediapipe/tasks-vision@0.10.3/vision_bundle.js',
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/vision_bundle.js'
        ];

        for (const url of urls) {
          try {
            updateDebug('Trying script: ' + url.split('@')[1].split('/')[0]);

            // Load script
            const script = document.createElement('script');
            script.src = url;
            script.type = 'text/javascript';

            await new Promise((resolve, reject) => {
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });

            updateDebug('Script loaded, checking globals...');

            // Check for various possible global names
            const possibleGlobals = [
              'fileset_resolver',
              'vision',
              'MediaPipeVision',
              'TasksVision'
            ];

            console.log('Available globals:', Object.keys(window).filter(k =>
              possibleGlobals.some(g => k.toLowerCase().includes(g.toLowerCase())) ||
              k.toLowerCase().includes('mediapipe')
            ));

            // Check standard globals
            if (window.fileset_resolver && window.vision &&
                window.fileset_resolver.FilesetResolver && window.vision.GestureRecognizer) {
              updateDebug('Standard globals found');
              createGestureRecognizer();
              return;
            }

            // Check alternative globals
            if (window.MediaPipeVision || window.TasksVision) {
              updateDebug('Alternative globals found');
              // Try to map them to expected structure
              if (window.MediaPipeVision) {
                window.fileset_resolver = window.MediaPipeVision.fileset_resolver || window.fileset_resolver;
                window.vision = window.MediaPipeVision.vision || window.vision;
              }
              if (window.TasksVision) {
                window.fileset_resolver = window.TasksVision.fileset_resolver || window.fileset_resolver;
                window.vision = window.TasksVision.vision || window.vision;
              }

              if (window.fileset_resolver && window.vision) {
                createGestureRecognizer();
                return;
              }
            }

            // Wait and check again
            await new Promise(resolve => setTimeout(resolve, 500));

            if (window.fileset_resolver && window.vision &&
                window.fileset_resolver.FilesetResolver && window.vision.GestureRecognizer) {
              updateDebug('Globals found after delay');
              createGestureRecognizer();
              return;
            }

          } catch (e) {
            updateDebug('Failed: ' + url.split('/')[2]);
            continue;
          }
        }

        // If all failed
        updateDebug('All MediaPipe loading attempts failed');
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({
          type: 'error',
          message: 'Failed to load MediaPipe - library may have changed API'
        }));

      } catch (e) {
        updateDebug('MediaPipe loading error: ' + e.message);
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({
          type: 'error',
          message: 'MediaPipe loading error: ' + e.message
        }));
      }
    }

    // Create gesture recognizer (for landmark detection only)
    async function createGestureRecognizer() {
      try {
        updateDebug('Creating recognizer for landmarks...');
        console.log('Creating recognizer with:', {
          fileset_resolver: window.fileset_resolver,
          vision: window.vision,
          hasFilesetResolver: !!(window.fileset_resolver && window.fileset_resolver.FilesetResolver),
          hasGestureRecognizer: !!(window.vision && window.vision.GestureRecognizer)
        });

        if (!window.fileset_resolver || !window.fileset_resolver.FilesetResolver) {
          throw new Error('FilesetResolver not available');
        }

        const vision = await window.fileset_resolver.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        if (!window.vision || !window.vision.GestureRecognizer) {
          throw new Error('GestureRecognizer not available');
        }

        console.log('Creating gesture recognizer with vision object:', vision);
        gestureRecognizer = await window.vision.GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode,
          numHands: 2,
        });
        console.log('Gesture recognizer created:', gestureRecognizer);
        updateDebug('Recognizer ready');
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({
          type: 'telemetry',
          event: 'recognizer_ready'
        }));

        // Start prediction loop immediately if video is already loaded
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
          console.log('Video already loaded, starting prediction immediately');
          updateDebug('Video already loaded, starting prediction');
          predictWebcam();
        } else {
          // Start prediction loop when video loads
          video.addEventListener('loadeddata', () => {
            console.log('Video loadeddata event fired, starting prediction loop');
            updateDebug('Video loaded, starting prediction');
            predictWebcam();
          });
        }

        video.addEventListener('play', () => {
          console.log('Video play event fired');
        });

        video.addEventListener('canplay', () => {
          console.log('Video canplay event fired');
        });
      } catch (e) {
        updateDebug('Recognizer error: ' + e.message);
        console.log('Recognizer creation failed:', e);
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({
          type: 'error',
          message: 'Failed to create gesture recognizer: ' + e.message
        }));
      }
    }

    // Prediction loop
    function predictWebcam() {
      try {
        frameCount++;
        if (frameCount % 60 === 0) { // Log every second at 60fps
          console.log('Prediction loop running, video state:', {
            currentTime: video.currentTime,
            paused: video.paused,
            ended: video.ended,
            readyState: video.readyState
          });
        }

        if (gestureRecognizer && video.currentTime > 0 && !video.paused && !video.ended) {
          if (lastVideoTime !== video.currentTime) {
            lastVideoTime = video.currentTime;
            const start = performance.now();
            const results = gestureRecognizer.recognizeForVideo(video, start);
            const frameLatency = Math.round(performance.now() - start);
            frameCount++;

            // Process results - send landmarks only, no gesture classification
            const allLandmarks = [];

            if (results?.landmarks?.length) {
              for (let i = 0; i < results.landmarks.length; i++) {
                const hand = results.landmarks[i];
                const landmarks = hand.map(lm => [lm.x, lm.y, lm.z ?? 0]);
                allLandmarks.push(landmarks);
              }
            }

            // Send landmark data only
            const now = performance.now();
            if (now - lastSentAt >= 100) { // Send every 100ms
              lastSentAt = now;
              console.log('Sending landmarks:', { landmarksCount: allLandmarks.length });
              window.ReactNativeWebView?.postMessage?.(JSON.stringify({
                type: 'gesture',
                gesture: null, // No gesture from WebView
                confidence: 0, // No confidence
                landmarks: allLandmarks,
              }));
            }
          }
        }
      } catch (e) {
        console.warn('Prediction error:', e);
      }
      window.requestAnimationFrame(predictWebcam);
    }

    // Start camera function
    async function startCamera() {
      try {
        updateDebug('Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: window.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        video.srcObject = stream;
        video.muted = true;
        // Mirror video for front camera to correct left/right orientation
        video.style.transform = window.facingMode === 'user' ? 'scaleX(-1)' : 'none';
        await video.play();
        updateDebug('Camera started, video playing. Loading MediaPipe...');
        console.log('Video element state:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          currentTime: video.currentTime,
          paused: video.paused,
          ended: video.ended
        });
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({
          type: 'telemetry',
          event: 'camera_started',
          tracks: stream.getVideoTracks().map(t => t.label)
        }));
        // Load MediaPipe after camera starts
        loadTasksVision();
      } catch (err) {
        const msg = (err && (err.name + ': ' + err.message)) || String(err);
        updateDebug('Camera error: ' + msg);
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({
          type: 'error',
          message: 'Camera access failed: ' + msg
        }));
      }
    }

    // Tap to start handler
    tapToStart.addEventListener('click', async () => {
      tapToStart.classList.add('hidden');
      await startCamera();
    });

    // Initial load message
    window.ReactNativeWebView?.postMessage?.(JSON.stringify({
      type: 'telemetry',
      event: 'webview_loaded'
    }));
    updateDebug('WebView loaded at ' + new Date().toLocaleTimeString());
  </script>
</body>
</html>`;

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'gesture') {
        onGestureDetected(data.gesture, data.confidence, data.landmarks);
      } else if (data.type === 'telemetry') {
        onWebViewEvent?.(data);
      } else if (data.type === 'error') {
        onError(data.message);
      }
    } catch (error) {
      onError('WebView message error');
    }
  };

  if (!WebViewImpl) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>WebView unavailable</Text>
      </View>
    );
  }

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
        mediaCapturePermissionGrantType={'grant'}
        androidLayerType={'hardware'}
        mixedContentMode={'always'}
        onPermissionRequest={(event: any) => {
          try {
            const videoOnly = (event.nativeEvent.resources || []).filter((r: string) => r === 'VIDEO_CAPTURE');
            event.nativeEvent.grant(videoOnly);
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