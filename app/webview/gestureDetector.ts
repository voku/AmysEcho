/**
 * Bundled into app/assets/gestureDetector.js for the WebView.
 * Run `npm run build:webview --prefix app` to regenerate.
 */
import { unzipSync, unzip } from 'fflate';
import { installMlp } from '../src/webview/installMlp';
import { HAND_CONNECTIONS } from '../src/constants/hand';

// Forward script errors to React Native for easier debugging
const onError = (e: ErrorEvent) => {
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: e.message,
        file: e.filename,
        line: e.lineno,
        col: e.colno,
        stack: e.error?.stack || null,
      }),
    );
  } catch (err) {
    console.warn('Failed to forward script error event:', err);
  }
};
window.addEventListener('error', onError);

const onUnhandledRejection = (e: PromiseRejectionEvent) => {
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: String(e?.reason?.message ?? e?.reason ?? 'unhandledrejection'),
        stack: e.reason?.stack || null,
      }),
    );
  } catch (err) {
    console.warn('Failed to forward unhandledrejection:', err);
  }
};
window.addEventListener('unhandledrejection', onUnhandledRejection);

// Expose fflate for compatibility with older WebView bundles
window.fflate = { unzip, unzipSync };
installMlp();
try {
  window.ReactNativeWebView?.postMessage?.(
    JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }),
  );
} catch (err) {
  console.warn("Failed to send 'mlp_ready' telemetry event:", err);
}

const tapToStartText = window.__tapToStart || '';
const recognizerInitFailed =
  window.__recognizerInitFailed || 'Erkennung konnte nicht gestartet werden: ';
const predictionError = window.__predictionError || 'Vorhersagefehler: ';
const cameraError = window.__cameraError || 'Kamerafehler: ';
const facingMode = window.__facingMode || 'user';
const mirrorOverlay = window.__mirrorOverlay === true;
const MLP_CONFIDENCE_THRESHOLD = window.__mlpThreshold ?? 0.6;
// Minimum confidence below which custom gesture fallbacks activate
const FALLBACK_CONFIDENCE_THRESHOLD = window.__fallbackThreshold ?? 0.5;
// Timeout for CDN fetches and script loads to avoid hangs
const LOAD_TIMEOUT_MS = 8000;

// Dynamically load MediaPipe Tasks Vision from CDN and wait until it's ready
async function loadTasksVision() {
  // Resolve a pinned version from host config if provided
  async function resolvePinnedBase() {
    const pinnedVersion = window.__mediapipeVersion;
    if (typeof pinnedVersion === 'string' && pinnedVersion.length) {
      return { base: 'https://cdn.jsdelivr.net/npm', version: pinnedVersion };
    }
    const cdns = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'];
    const controllers = cdns.map(() => new AbortController());
    const fetches = cdns.map((base, i) =>
      (async () => {
        try {
          const ac = controllers[i];
          const t = setTimeout(() => ac.abort(), LOAD_TIMEOUT_MS);
          const pkg = await fetch(base + '/@mediapipe/tasks-vision/package.json', {
            method: 'GET',
            signal: ac.signal,
            cache: 'no-store',
          }).finally(() => clearTimeout(t));
          if (pkg.ok) {
            const json = await pkg.json().catch(() => null);
            const v = json?.version;
            if (typeof v === 'string' && v.length) {
              controllers.forEach((c, j) => {
                if (j !== i) c.abort();
              });
              return { base, version: v };
            }
          }
        } catch (err) {
          if ((err as any)?.name !== 'AbortError') {
            console.warn('Fetch failed:', base, err);
          }
        }
        return null;
      })(),
    );
    const results = await Promise.all(fetches);
    return results.find(Boolean) || null;
  }

  function tryLoadScript(src: string, integrity?: string, timeoutMs = LOAD_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
      }
      if (window.__visionBundleNonce) {
        s.nonce = window.__visionBundleNonce;
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
        reject(new Error('Script failed to load: ' + src));
      };
      document.head.appendChild(s);
    });
  }

  const haveUMD = () =>
    window.fileset_resolver &&
    window.fileset_resolver.FilesetResolver &&
    window.vision &&
    window.vision.GestureRecognizer;

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
        const sri =
          pinned && c.umd.includes(`@${pinned.version}/`) ? window.__visionBundleSri : undefined;
        await tryLoadScript(c.umd, sri);
      }
      if (haveUMD()) {
        return {
          FilesetResolver: window.fileset_resolver.FilesetResolver,
          GestureRecognizer: window.vision.GestureRecognizer,
          wasmBase: c.wasm,
        };
      }
      // Try ESM next (optional: gate via host config)
      if (window.__allowCdnEsm === true) {
        try {
          const mod = await import(/* @vite-ignore */ c.esm);
          if (mod?.FilesetResolver && mod?.GestureRecognizer) {
            return {
              FilesetResolver: mod.FilesetResolver,
              GestureRecognizer: mod.GestureRecognizer,
              wasmBase: c.wasm,
            };
          }
        } catch (e) {
          lastError = e;
        }
      }
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    'Tasks Vision globals not available' +
      (lastError ? ': ' + (lastError.message || lastError) : ''),
  );
}
type GestureRecognizerLike = {
  recognizeForVideo(
    video: HTMLVideoElement,
    timestamp: number,
  ): {
    gestures?: Array<Array<{ categoryName: string; score: number }>>;
    landmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
    handednesses?: Array<Array<{ categoryName: string }>>;
  } | undefined;
  close?: () => Promise<void> | void;
};
let gestureRecognizer: GestureRecognizerLike | null = null;
let runningMode = 'VIDEO';
const video = document.createElement('video');
const overlay = document.createElement('canvas');
overlay.id = 'overlay';
let lastVideoWidth = 0;
let lastVideoHeight = 0;
let overlayWidth = 0;
let overlayHeight = 0;
let overlayDpr = 1;
let videoResizeObserver: ResizeObserver | null = null;
let removeWindowResize: (() => void) | null = null;
video.setAttribute('autoplay', '');
video.setAttribute('playsinline', '');
video.setAttribute('muted', '');
function initDom() {
  document.body.appendChild(video);
  document.body.appendChild(overlay);
  try { resizeOverlay(); } catch (e) { console.warn('Initial resize failed:', e); }
  if (typeof ResizeObserver === 'function') {
    videoResizeObserver = new ResizeObserver(() => resizeOverlay());
    videoResizeObserver.observe(video);
  } else {
    const onWinResize = () => resizeOverlay();
    window.addEventListener('resize', onWinResize);
    removeWindowResize = () => window.removeEventListener('resize', onWinResize);
  }
  const tap = document.createElement('div');
  tap.id = 'tapToStart';
  tap.innerText = tapToStartText;
  if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
    tap.classList.add('hidden');
  }
  tap.addEventListener('click', async () => {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'telemetry', event: 'tap_start' }),
      );
    } catch (postErr) {
      console.warn("Failed to send 'tap_start' telemetry event:", postErr);
    }
    try {
      await startCamera();
      tap.classList.add('hidden');
    } catch (err) {
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'error',
            message: cameraError + (err instanceof Error ? err.message : String(err)),
          }),
        );
      } catch (postErr) {
        console.warn('Failed to send camera error:', postErr);
      }
      return;
    }
  });
  document.body.appendChild(tap);
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: 'telemetry', event: 'dom_ready' }),
    );
  } catch (err) {
    console.warn("Failed to send 'dom_ready' telemetry event:", err);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDom);
} else {
  initDom();
}

async function createGestureRecognizer() {
  try {
    const visionStart = performance.now();
  const { FilesetResolver, GestureRecognizer, wasmBase } = await loadTasksVision();
  const vision = await FilesetResolver.forVisionTasks(
    wasmBase || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
  );
    const baseOptions = {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
      delegate: 'GPU' as const,
    };
    try {
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions,
        runningMode,
        numHands: 2,
      });
    } catch (gpuErr) {
      console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'recognizer_gpu_fallback' }),
        );
      } catch (err) {
        console.warn(
          "Failed to send 'recognizer_gpu_fallback' telemetry event:",
          err,
        );
      }
      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { ...baseOptions, delegate: 'CPU' as const },
        runningMode,
        numHands: 2,
      });
    }
    const initMs = Math.round(performance.now() - visionStart);
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'telemetry', event: 'recognizer_init', ms: initMs }),
      );
    } catch (err) {
      console.warn('Failed to send "recognizer_init" telemetry event:', err);
    }
    // Start prediction loop after recognizer is created
    video.addEventListener('loadeddata', predictWebcam);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.srcObject) {
      window.requestAnimationFrame(predictWebcam);
    }
    resetGestureChangeState();
  } catch (e) {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'error',
          message: recognizerInitFailed + (e instanceof Error ? e.message : String(e)),
        }),
      );
    } catch (err) {
      console.warn('Failed to send initialization error message:', err);
    }
  }
}

let lastVideoTime = -1; // Added for performance optimization
let frameCount = 0;
let lastSentAt = 0;
let lastSentGestureSerialized: string | null = null;
let lastSentScore = 0;
let running = true;
let cleanedUp = false;
type TwoHandGesture = { left: string; right: string };
function serializeGesture(g: string | TwoHandGesture | null): string | null {
  if (g == null) return null;
  if (typeof g === 'string') return g;
  // Stable, order-preserving representation for change detection only
  return JSON.stringify({ left: g.left, right: g.right });
}
function resetGestureChangeState() {
  lastSentGestureSerialized = null;
  lastSentScore = 0;
  lastSentAt = 0;
}
// Target processing rate to balance accuracy and device load
const TARGET_FPS = 30;
const MIN_FRAME_TIME = 1000 / TARGET_FPS;
const FRAME_LATENCY_SAMPLE_INTERVAL = 90; // ~3s @ 30fps
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
      if (lastVideoTime !== video.currentTime) {
        // Only process if video frame has changed
        lastVideoTime = video.currentTime;
        if (
          video.videoWidth !== lastVideoWidth ||
          video.videoHeight !== lastVideoHeight
        ) {
          resizeOverlay();
        }
        const start = performance.now();
        const results = gestureRecognizer.recognizeForVideo(video, start);
        const frameLatency = Math.round(performance.now() - start);
        frameCount++;
        if (frameCount % FRAME_LATENCY_SAMPLE_INTERVAL === 0) {
          try {
            window.ReactNativeWebView?.postMessage?.(
              JSON.stringify({ type: 'telemetry', event: 'frame_latency', ms: frameLatency }),
            );
          } catch (err) {
            console.warn("Failed to send 'frame_latency' telemetry event:", err);
          }
        }
        const allLandmarks = (results?.landmarks || []).map((hand) =>
          hand.map((lm) => [lm.x, lm.y, lm.z ?? 0]),
        );
        let outGesture: string | { left: string; right: string } | null = null;
        let outScore = 0;
        const perHand: { hand: string; label: string; score: number }[] = [];
        let multiHand = (results?.landmarks?.length ?? 0) >= 2;
        const handedArr = (results?.handednesses || []).map(
          (h) => h?.[0]?.categoryName || 'unknown',
        );
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
            let left = perHand.find((h) => /left/i.test(h.hand)) || null;
            let right = perHand.find((h) => /right/i.test(h.hand)) || null;
            if (!left || !right) {
              const others = perHand.filter((h) => h !== left && h !== right);
              if (!left) left = others.shift() || null;
              if (!right) right = others.shift() || null;
            }
            if (left && right) {
              outGesture = { left: left.label, right: right.label };
              // Geometric mean keeps confidence conservative without over-penalizing
              outScore = Math.sqrt(left.score * right.score);
            }
          }
        }
        // ** MLP Gesture Prediction **
        if (window.__mlpPredict) {
          const mlpResult = window.__mlpPredict(
            allLandmarks,
            results?.handednesses ?? [],
          );
          if (mlpResult && mlpResult.score > MLP_CONFIDENCE_THRESHOLD) {
            outGesture = mlpResult.label;
            outScore = mlpResult.score;
          }
        }
        // Custom gesture logic (preserved for single-hand fallback)
        const firstHand = allLandmarks[0] || [];
        if (
          (!outGesture || outScore < FALLBACK_CONFIDENCE_THRESHOLD) &&
          firstHand.length === 21 &&
          !multiHand
        ) {
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
          const ctx = overlay.getContext('2d');
          if (ctx && overlayWidth && overlayHeight) {
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            ctx.save();
            // Draw in CSS pixels while canvas is scaled for HiDPI
            ctx.scale(overlayDpr, overlayDpr);
            // Mirror horizontally to match video when using the front camera
            if (mirrorOverlay) {
              ctx.scale(-1, 1);
              ctx.translate(-overlayWidth, 0);
            }
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
            ctx.fillStyle = 'rgba(0, 255, 180, 0.9)';
            for (const hand of results?.landmarks || []) {
              // connectors
              ctx.beginPath();
              for (const [a, b] of HAND_CONNECTIONS) {
                const pa = hand[a];
                const pb = hand[b];
                if (!pa || !pb) continue;
                ctx.moveTo(pa.x * overlayWidth, pa.y * overlayHeight);
                ctx.lineTo(pb.x * overlayWidth, pb.y * overlayHeight);
              }
              ctx.stroke();
              // points
              for (const lm of hand) {
                ctx.beginPath();
                ctx.arc(lm.x * overlayWidth, lm.y * overlayHeight, 4, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.restore();
          }
        } catch (err) {
          console.warn('Failed to draw overlay:', err);
        }

        const now = performance.now();
        const confidence = allLandmarks.length ? outScore : 0;
        const isTick = now - lastSentAt >= 100;
        const serializedGesture = serializeGesture(outGesture);
        const changed =
          serializedGesture !== lastSentGestureSerialized ||
          Math.abs(confidence - lastSentScore) >= 0.05;
        if (changed || isTick) {
          lastSentGestureSerialized = serializedGesture;
          lastSentScore = confidence;
          lastSentAt = now;
          try {
            const payload: {
              type: 'gesture';
              gesture: string | { left: string; right: string } | null;
              confidence: number;
              landmarks?: number[][][];
              handednesses?: string[];
            } = {
              type: 'gesture',
              gesture: outGesture,
              confidence,
            };
            if (changed) {
              payload.landmarks = allLandmarks;
              payload.handednesses = handedArr;
            }
            window.ReactNativeWebView?.postMessage?.(JSON.stringify(payload));
          } catch (err) {
          console.warn('Failed to send gesture result:', err);
          }
        }
      }
    }
  } catch (e) {
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'warn',
          message: predictionError + (e instanceof Error ? e.message : String(e)),
        }),
      );
    } catch (err) {
      console.warn('Failed to send warning:', err);
    }
  }
  window.requestAnimationFrame(predictWebcam);
}

// Note: server-based fallback removed; on-device recognition only

function resizeOverlay() {
  try {
    const rect = video.getBoundingClientRect();
    const w = (rect.width || video.clientWidth || 0) | 0;
    const h = (rect.height || video.clientHeight || 0) | 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const sizeChanged = overlayWidth !== w || overlayHeight !== h;
    const dprChanged = dpr !== overlayDpr;
    if (sizeChanged || dprChanged) {
      if (sizeChanged) {
        overlay.style.width = w + 'px';
        overlay.style.height = h + 'px';
      }
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
      overlayWidth = w;
      overlayHeight = h;
      overlayDpr = dpr;
    }
    lastVideoWidth = video.videoWidth;
    lastVideoHeight = video.videoHeight;
  } catch (err) {
    console.warn('Failed to resize overlay:', err);
  }
}

async function startCamera() {
  resetGestureChangeState();
  // Renamed from start() for clarity
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    try {
      video.muted = true;
      await video.play();
      if (
        video.videoWidth !== lastVideoWidth ||
        video.videoHeight !== lastVideoHeight
      ) {
        resizeOverlay();
      }
    } catch (err) {
      console.warn('Failed to start video:', err);
      throw err;
    }
    const tracks = stream.getVideoTracks();
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'telemetry',
          event: 'camera_started',
          tracks: tracks.map((t) => t.label),
        }),
      );
    } catch (err) {
      console.warn("Failed to send 'camera_started' telemetry event:", err);
    }
    // createGestureRecognizer will add the loadeddata listener
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'error', message: cameraError + msg }),
      );
    } catch (postErr) {
      console.warn('Failed to send camera error:', postErr);
    }
    throw err;
  }
}

// Start camera only after user interaction unless explicitly allowed
if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
  startCamera()
    .then(() => {
      document.getElementById('tapToStart')?.classList.add('hidden');
      try {
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'tap_start_autostart' }),
        );
      } catch (err) {
        console.warn("Failed to send 'tap_start_autostart' telemetry event:", err);
      }
    })
    .catch((err) => {
      console.warn('Camera autostart failed:', err);
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
      console.warn('Failed to pause video during cleanup:', e);
    }
    try {
      video.removeEventListener('loadeddata', predictWebcam);
    } catch (e) {
      console.warn("Failed to remove 'loadeddata' listener during cleanup:", e);
    }
    try {
      const s = video.srcObject as MediaStream | null;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
    } catch (e) {
      console.warn('Failed to stop camera stream:', e);
    }
    try {
      const res = gestureRecognizer?.close?.();
      if (res && typeof res.then === 'function') await res;
    } catch (e) {
      console.warn('Failed to close gesture recognizer:', e);
    }
    gestureRecognizer = null;
  })().finally(() => {
    stopPromise = null;
  });
  return stopPromise;
}

const onPageHide = () => void cleanup();
const onBeforeUnload = () => void cleanup();
const onVisibilityChange = () => {
  if (document.hidden) {
    running = false;
  } else {
    running = true;
    lastFrameTs = 0;
    resetGestureChangeState();
    // Ensure overlay matches current layout/DPR after tab visibility changes
    try { resizeOverlay(); } catch (e) { console.warn('Resize on visibility change failed:', e); }
    window.requestAnimationFrame(predictWebcam);
  }
};
window.addEventListener('pagehide', onPageHide);
window.addEventListener('beforeunload', onBeforeUnload);
document.addEventListener('visibilitychange', onVisibilityChange);

async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  running = false;
  await stopCamera();
  if (videoResizeObserver) {
    videoResizeObserver.disconnect();
  }
  videoResizeObserver = null;
  if (removeWindowResize) {
    removeWindowResize();
    removeWindowResize = null;
  }
  try {
    const tapEl = document.getElementById('tapToStart');
    if (tapEl) {
      tapEl.remove();
    }
  } catch (e) {
    console.warn("Failed to remove 'tapToStart' element:", e);
  }
  try {
    overlay.remove();
  } catch (e) {
    console.warn("Failed to remove 'overlay' element:", e);
  }
  try {
    video.remove();
  } catch (e) {
    console.warn("Failed to remove 'video' element:", e);
  }
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('beforeunload', onBeforeUnload);
  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }),
    );
  } catch (e) {
    console.warn("Failed to send 'cleanup_done' telemetry event:", e);
  }
}
window.__cleanupGestureDetector = cleanup;
