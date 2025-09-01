/**
 * Bundled into app/assets/gestureDetector.js for the WebView.
 * Run `npm run build:webview --prefix app` to regenerate.
 */
import { unzipSync, unzip } from 'fflate';
import { installMlp } from '../src/webview/installMlp';
import { HAND_CONNECTIONS } from '../src/constants/hand';

// Forward script errors to React Native for easier debugging
window.addEventListener('error', (e) => {
  try {
    (window as any).ReactNativeWebView?.postMessage(
      JSON.stringify({ type: 'error', message: e.message, file: (e as any).filename, line: (e as any).lineno, col: (e as any).colno }),
    );
  } catch {}
});

(window as any).fflate = { unzip, unzipSync };
installMlp();
try {
  (window as any).ReactNativeWebView?.postMessage?.(
    JSON.stringify({ type: 'telemetry', event: 'mlp_ready' })
  );
} catch {}

const tapToStartText = (window as any).__tapToStart || '';
const recognizerInitFailed = (window as any).__recognizerInitFailed || 'Erkennung konnte nicht gestartet werden: ';
const predictionError = (window as any).__predictionError || 'Vorhersagefehler: ';
const cameraError = (window as any).__cameraError || 'Kamerafehler: ';
const facingMode = (window as any).__facingMode || 'user';
const mirrorOverlay = (window as any).__mirrorOverlay === true;
const MLP_CONFIDENCE_THRESHOLD = (window as any).__mlpThreshold ?? 0.6;
const FALLBACK_CONFIDENCE_THRESHOLD = (window as any).__fallbackThreshold ?? 0.5;

    // Dynamically load MediaPipe Tasks Vision from CDN and wait until it's ready
    async function loadTasksVision() {
      // Resolve a pinned version from host config if provided
      async function resolvePinnedBase() {
        const pinnedVersion = (window as any).__mediapipeVersion;
        if (typeof pinnedVersion === 'string' && pinnedVersion.length) {
          return { base: 'https://cdn.jsdelivr.net/npm', version: pinnedVersion };
        }
        const cdns = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
        for (const base of cdns) {
          try {
            const pkg = await fetch(base + '/@mediapipe/tasks-vision/package.json', { method: 'GET' });
            if (pkg.ok) {
              const json = await pkg.json().catch(() => null);
              const v = json?.version;
              if (typeof v === 'string' && v.length) {
                return { base, version: v };
              }
            }
          } catch {}
        }
        return null;
      }

      function tryLoadScript(src: string, timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src;
          if ((window as any).__visionBundleSri) {
            s.integrity = (window as any).__visionBundleSri;
            s.crossOrigin = 'anonymous';
          }
          if ((window as any).__visionBundleNonce) {
            (s as any).nonce = (window as any).__visionBundleNonce;
          }
          s.async = true;
          const cleanup = () => {
            s.onload = s.onerror = null;
            if (s.parentNode) s.parentNode.removeChild(s);
          };
          const to = setTimeout(() => {
            cleanup();
            reject(new Error('Script load timeout: ' + src));
          }, timeoutMs);
          s.onload = () => {
            clearTimeout(to);
            cleanup();
            resolve(null);
          };
          s.onerror = () => {
            clearTimeout(to);
            cleanup();
            reject(new Error('Failed to load script: ' + src));
          };
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
    overlay.addEventListener('contextlost', (e) => { e.preventDefault(); });
    overlay.addEventListener('contextrestored', () => {
      // Ensure a fresh context can be obtained after restoration
      overlay.getContext('2d');
      resizeOverlay();
      // Trigger a redraw immediately so the overlay doesn't stay blank
      if (running) window.requestAnimationFrame(predictWebcam);
    });
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(video);
      document.body.appendChild(overlay);
      const tap = document.createElement('div');
      tap.id = 'tapToStart';
      tap.innerText = tapToStartText;
      if ((window as any).__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
        tap.classList.add('hidden');
      }
      tap.addEventListener('click', async () => {
        try {
          await startCamera();
          tap.classList.add('hidden');
          window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type:'telemetry', event:'tap_start' }));
        } catch (err) {
          try {
            (window as any).ReactNativeWebView?.postMessage?.(
              JSON.stringify({ type: 'error', message: cameraError + (err instanceof Error ? err.message : String(err)) }),
            );
          } catch (postErr) {
            console.warn('Kamerafehler konnte nicht gesendet werden:', postErr);
          }
        }
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
        try {
          window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'recognizer_init', ms: initMs }));
        } catch {}
        // Start prediction loop after recognizer is created and video is loaded
        video.addEventListener('loadeddata', predictWebcam);
      } catch (e) {
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({ type: 'error', message: recognizerInitFailed + (e instanceof Error ? e.message : String(e)) })
          );
        } catch {}
      }
    }

    let lastVideoTime = -1; // Added for performance optimization
    let frameCount = 0;
    let lastSentAt = 0;
    let lastSentGesture = null;
    let lastSentScore = 0;
    let running = true;
    let cleanedUp = false;
    const TARGET_FPS = 30;
    const MIN_FRAME_TIME = 1000 / TARGET_FPS;
    let lastFrameTs = 0;
    function predictWebcam() {
      if (!running) return;
      const nowTime = performance.now();
      if (nowTime - lastFrameTs < MIN_FRAME_TIME) {
        window.requestAnimationFrame(predictWebcam);
        return;
      }
      lastFrameTs = nowTime;
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
            const perHand: { hand: string; label: string; score: number }[] = [];
            let multiHand = ((results?.landmarks?.length ?? 0) >= 2);
            const handedArr = (results?.handednesses || []).map(h => (h?.[0]?.categoryName) || 'unknown');
            if (results?.gestures?.length) {
              for (let i = 0; i < results.gestures.length; i++) {
                const handGestures = results.gestures[i] || [];
                const top = handGestures?.[0];
                const handed = handedArr[i] || 'unknown';
                if (top) {
                  perHand.push({ hand: handed, label: top.categoryName, score: top.score });
                  if (top.score > outScore) {
                    outGesture = top.categoryName;
                    outScore = top.score;
                  }
                }
              }
              if (perHand.length >= 2) {
                let left = perHand.find(h => /left/i.test(h.hand)) || null;
                let right = perHand.find(h => /right/i.test(h.hand)) || null;
                if (!left || !right) {
                  const others = perHand.filter(h => h !== left && h !== right);
                  if (!left) left = others.shift() || null;
                  if (!right) right = others.shift() || null;
                }
                if (left && right) {
                  outGesture = left.label + '+' + right.label;
                  // Geometric mean keeps confidence conservative without over-penalizing
                  outScore = Math.sqrt(left.score * right.score);
                }
              }
            }
            // ** MLP Gesture Prediction **
            if (window.__mlpPredict) {
              const mlpResult = window.__mlpPredict(allLandmarks, results.handednesses);
              if (mlpResult && mlpResult.score > MLP_CONFIDENCE_THRESHOLD) {
                outGesture = mlpResult.label;
                outScore = mlpResult.score;
              }
            }
            // Custom gesture logic (preserved for single-hand fallback)
            const firstHand = allLandmarks[0] || [];
            if ((!outGesture || outScore < FALLBACK_CONFIDENCE_THRESHOLD) && firstHand.length === 21 && !multiHand) {
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
                // Mirror horizontally to match video when using the front camera
                if (mirrorOverlay) {
                  ctx.scale(-1, 1);
                  ctx.translate(-overlay.width, 0);
                }
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

              const now = performance.now();
              const confidence = allLandmarks.length ? outScore : 0;
              const changed = outGesture !== lastSentGesture || Math.abs(confidence - lastSentScore) >= 0.05;
              if (changed || now - lastSentAt >= 100) {
                lastSentGesture = outGesture;
                lastSentScore = confidence;
                lastSentAt = now;
                try {
                  window.ReactNativeWebView?.postMessage?.(
                    JSON.stringify({
                      type: 'gesture',
                      gesture: outGesture || null,
                      confidence,
                      landmarks: allLandmarks,
                      handednesses: handedArr,
                    }),
                  );
                } catch {}
              }
          }
        }
      } catch (e) {
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({ type: 'warn', message: predictionError + (e instanceof Error ? e.message : String(e)) })
          );
        } catch {}
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
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        video.srcObject = stream;
        try { video.muted = true; await video.play(); resizeOverlay(); } catch {}
        const tracks = stream.getVideoTracks();
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'telemetry', event: 'camera_started', tracks: tracks.map(t=>t.label) }));
        // createGestureRecognizer will add the loadeddata listener
      } catch (err) {
        const msg = (err && (err.name+': '+err.message)) || String(err);
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: cameraError + msg }));
      }
    }

    // Start camera only after user interaction unless explicitly allowed
    if ((window as any).__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
      startCamera()
        .then(() => {
          document.getElementById('tapToStart')?.classList.add('hidden');
          window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type:'telemetry', event:'tap_start_autostart' }));
        })
        .catch((err) => {
          console.warn('Autostart camera failed', err);
          document.getElementById('tapToStart')?.classList.remove('hidden');
        });
    }
    createGestureRecognizer();
    let stopPromise: Promise<void> | null = null;
    async function stopCamera() {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        try {
          video.pause();
        } catch (e) {
          console.warn('Video konnte während des Aufräumens nicht pausiert werden:', e);
        }
        try {
          video.removeEventListener('loadeddata', predictWebcam);
        } catch (e) {
          console.warn(
            'Entfernen des "loadeddata"-Listeners während des Aufräumens fehlgeschlagen:',
            e,
          );
        }
        try {
          const s = video.srcObject as MediaStream | null;
          if (s) {
            s.getTracks().forEach((t) => t.stop());
            video.srcObject = null;
          }
        } catch (e) {
          console.warn('Fehler beim Stoppen des Kamerastreams:', e);
        }
        try {
          const res = gestureRecognizer?.close?.();
          if (res && typeof (res as any).then === 'function') await res;
        } catch (e) {
          console.warn('Fehler beim Schließen des Gestenerkenners:', e);
        }
        gestureRecognizer = null;
      })().finally(() => {
        stopPromise = null;
      });
      return stopPromise;
    }

    const onPageHide = () => void cleanup();
    const onBeforeUnload = () => void cleanup();
    const onResize = () => resizeOverlay();
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('resize', onResize);

    async function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      running = false;
      await stopCamera();
      try {
        document.getElementById('tapToStart')?.remove();
      } catch (e) {
        console.warn('Fehler beim Entfernen des "tapToStart"-Elements:', e);
      }
      try {
        overlay.remove();
      } catch (e) {
        console.warn('Fehler beim Entfernen des "overlay"-Elements:', e);
      }
      try {
        video.remove();
      } catch (e) {
        console.warn('Fehler beim Entfernen des "video"-Elements:', e);
      }
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('resize', onResize);
      try {
        (window as any).ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }),
        );
      } catch (e) {
        console.warn('Senden des "cleanup_done" Telemetrie-Ereignisses fehlgeschlagen:', e);
      }
    }
    (window as any).__cleanupGestureDetector = cleanup;

