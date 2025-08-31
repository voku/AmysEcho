import { unzipSync } from 'fflate';
import { installMlp } from '../src/webview/installMlp';

(window as any).fflate = { unzipSync };
installMlp();

const tapToStartText = (window as any).__tapToStart || '';
const recognizerInitFailed = (window as any).__recognizerInitFailed || 'Recognizer init failed: ';
const predictionError = (window as any).__predictionError || 'Prediction error: ';
const cameraError = (window as any).__cameraError || 'Camera error: ';
const facingMode = (window as any).__facingMode || 'user';
const mirrorOverlay = (window as any).__mirrorOverlay === true;
const MLP_CONFIDENCE_THRESHOLD = (window as any).__mlpThreshold ?? 0.6;
const FALLBACK_CONFIDENCE_THRESHOLD = (window as any).__fallbackThreshold ?? 0.5;

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
      tap.innerText = tapToStartText;
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
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'error', message: recognizerInitFailed + (e?.message || e) }));
      }
    }

    let lastVideoTime = -1; // Added for performance optimization
    let frameCount = 0;
    let lastSentAt = 0;
    let lastSentGesture = null;
    let lastSentScore = 0;
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
            const handedArr = (results?.handednesses || []).map(h => (h?.[0]?.categoryName) || 'unknown');
            if (results?.gestures?.length) {
              for (let i=0; i<results.gestures.length; i++) {
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
                const left = perHand.find(h => /left/i.test(h.hand)) || perHand[0];
                const right = perHand.find(h => /right/i.test(h.hand)) || perHand[1];
                if (left && right) {
                  outGesture = left.label + '+' + right.label;
                  outScore = Math.min(left.score, right.score);
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
            if ((!outGesture || outScore < FALLBACK_CONFIDENCE_THRESHOLD) && firstHand.length === 21) {
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

              const now = performance.now();
              const confidence = allLandmarks.length ? outScore : 0;
              const changed = outGesture !== lastSentGesture || Math.abs(confidence - lastSentScore) >= 0.05;
              if (changed || now - lastSentAt >= 100) {
                lastSentGesture = outGesture;
                lastSentScore = confidence;
                lastSentAt = now;
                window.ReactNativeWebView?.postMessage?.(
                  JSON.stringify({
                    type: 'gesture',
                    gesture: outGesture || null,
                    confidence,
                    landmarks: allLandmarks,
                    handednesses: handedArr,
                  }),
                );
              }
          }
        }
      } catch (e) {
        window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'warn', message: predictionError + (e?.message || e) }));
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

    // Start camera and then create recognizer
    startCamera();
    createGestureRecognizer();
    function stopCamera() {
      try {
        const s = video.srcObject;
        if (s) {
          s.getTracks().forEach(t => t.stop());
          video.srcObject = null;
        }
      } catch {}
    }
    window.addEventListener('pagehide', stopCamera);
    window.addEventListener('beforeunload', stopCamera);
    window.addEventListener('resize', ()=>{ try { resizeOverlay(); } catch {} });

