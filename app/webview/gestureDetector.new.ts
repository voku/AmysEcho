/**
 * Simplified and modular gesture detector
 * Uses the GestureRecognitionOrchestrator for clean separation of concerns
 */

// Forward script errors to React Native for easier debugging
const onError = (e: ErrorEvent) => {
  try {
    // Send a generic child-friendly error message instead of technical details
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: 'gesture_processing_error', // Generic identifier for React Native to handle
        // Keep technical details for logging but don't send to UI
        _technical: {
          message: e.message,
          file: e.filename,
          line: e.lineno,
          col: e.colno,
          stack: e.error?.stack || null,
        },
      }),
    );
  } catch (err) {
    console.warn('Failed to forward script error event:', err);
  }
};
window.addEventListener('error', onError);

// Forward console.log to React Native for debugging
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'telemetry',
        event: 'console_log',
        message: args.join(' '),
        timestamp: Date.now(),
      }),
    );
  } catch (err) {
    console.debug('Failed to forward console.log message to React Native:', err);
  }
  originalConsoleLog(...args);
};

const onUnhandledRejection = (e: PromiseRejectionEvent) => {
  try {
    // Send a generic child-friendly error message instead of technical details
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: 'gesture_processing_error', // Generic identifier for React Native to handle
        // Keep technical details for logging but don't send to UI
        _technical: {
          message: String(e?.reason?.message ?? e?.reason ?? 'unhandledrejection'),
          stack: e.reason?.stack || null,
        },
      }),
    );
  } catch (err) {
    console.warn('Failed to forward unhandledrejection:', err);
  }
};
window.addEventListener('unhandledrejection', onUnhandledRejection);

import { unzip, unzipSync } from 'fflate';
import { installMlp } from '../src/webview/installMlp';
import { GestureRecognitionOrchestrator } from './core/GestureRecognitionOrchestrator';

// Initialize configuration
const tapToStartText = window.__tapToStart || '';
const recognizerInitFailed =
  window.__recognizerInitFailed || 'Erkennung konnte nicht gestartet werden: ';
window.__predictionError = window.__predictionError || 'Vorhersagefehler: ';
const cameraError = window.__cameraError || 'Kamerafehler: ';
const facingMode = window.__facingMode || 'user';
const mirrorOverlay = window.__mirrorOverlay === true;

const container = document.createElement('div');
container.id = 'gestureCameraContainer';

// Create DOM elements
const video = document.createElement('video');
const overlay = document.createElement('canvas');
overlay.id = 'overlay';
video.setAttribute('autoplay', '');
video.setAttribute('playsinline', '');
video.setAttribute('muted', '');

function ensureStyleSheet() {
  if (document.getElementById('gesture-detector-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'gesture-detector-styles';
  style.textContent = `
    html, body {
      height: 100%;
      width: 100%;
    }

    body.gesture-detector {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #ecfdf5;
      background-image: radial-gradient(circle at 20% 20%, rgba(134, 239, 172, 0.25), transparent 60%),
        radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.18), transparent 55%);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .gesture-detector-container {
      position: relative;
      width: min(96vw, 640px);
      height: min(72vh, 480px);
      max-width: 100vw;
      max-height: 100vh;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(226, 252, 245, 0.92));
    }

    .gesture-detector-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background-color: #f8fafc;
      filter: brightness(1.08);
      transition: filter 0.2s ease;
      transform-origin: center;
    }

    .gesture-detector-video.mirrored {
      transform: scaleX(-1);
    }

    .gesture-detector-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      background-color: rgba(255, 255, 255, 0.08);
      mix-blend-mode: screen;
    }

    .gesture-detector-tap {
      position: absolute;
      bottom: 5%;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: linear-gradient(135deg, #10b981, #22d3ee);
      color: #0f172a;
      font-weight: 600;
      border-radius: 999px;
      box-shadow: 0 12px 24px rgba(14, 116, 144, 0.35);
      cursor: pointer;
      user-select: none;
      transition: transform 0.15s ease, box-shadow 0.2s ease;
    }

    .gesture-detector-tap:active {
      transform: translateX(-50%) scale(0.98);
    }

    .gesture-detector-tap.hidden {
      display: none;
    }
  `;

  document.head.appendChild(style);
}

function applyBaseStyles() {
  ensureStyleSheet();
  document.body.classList.add('gesture-detector');
  container.classList.add('gesture-detector-container');
  video.classList.add('gesture-detector-video');
  overlay.classList.add('gesture-detector-overlay');

  const shouldMirrorVideo = mirrorOverlay || facingMode === 'user';
  video.classList.toggle('mirrored', shouldMirrorVideo);
}

// Expose compression helpers and install the embedded MLP runtime
window.fflate = { unzip, unzipSync };
installMlp();

try {
  window.ReactNativeWebView?.postMessage?.(
    JSON.stringify({ type: 'telemetry', event: 'mlp_ready' })
  );
} catch (err) {
  console.warn("Failed to signal 'mlp_ready' event:", err);
}

// Create main orchestrator instance
let orchestrator: GestureRecognitionOrchestrator | null = null;

// Initialize DOM and start gesture recognition
function initDom() {
  applyBaseStyles();

  container.appendChild(video);
  container.appendChild(overlay);
  document.body.appendChild(container);

  // Create orchestrator
  orchestrator = new GestureRecognitionOrchestrator(video, overlay);
  window.__gestureOrchestrator = orchestrator;

  // Initialize orchestrator
  orchestrator.initialize().catch(error => {
    console.error('Failed to initialize gesture recognition:', error);
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: recognizerInitFailed + (error instanceof Error ? error.message : String(error)),
      }),
    );
  });

  // Create tap to start button
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

      if (orchestrator) {
        await orchestrator.start();
        tap.classList.add('hidden');
      }
    } catch (err) {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'error',
          message: cameraError + (err instanceof Error ? err.message : String(err)),
        }),
      );
    }
  });

  tap.classList.add('gesture-detector-tap');

  document.body.appendChild(tap);

  if (
    window.__autostartCamera === true &&
    (navigator.userActivation?.hasBeenActive ?? false)
  ) {
    const startPromise = orchestrator.start();
    startPromise
      .then(() => {
        tap.classList.add('hidden');
        window.ReactNativeWebView?.postMessage?.(
          JSON.stringify({ type: 'telemetry', event: 'tap_start_autostart' }),
        );
      })
      .catch((err: unknown) => {
        console.warn('Camera autostart failed:', err);
        tap.classList.remove('hidden');
      });
  }

  window.ReactNativeWebView?.postMessage?.(
    JSON.stringify({ type: 'telemetry', event: 'dom_ready' }),
  );
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDom);
} else {
  initDom();
}

// Page visibility handling
const onVisibilityChange = () => {
  if (document.hidden) {
    orchestrator?.stop();
  } else {
    orchestrator?.start();
  }
};
document.addEventListener('visibilitychange', onVisibilityChange);

// Cleanup function
async function cleanup() {
  try {
    orchestrator?.cancelClipCapture();
  } catch (err) {
    console.warn('Failed to cancel clip capture during cleanup:', err);
  }
  await orchestrator?.cleanup();
  orchestrator = null;
  window.__gestureOrchestrator = null;

  // Remove DOM elements
  try {
    const tapEl = document.getElementById('tapToStart');
    if (tapEl) tapEl.remove();
  } catch (e) {
    console.warn("Failed to remove 'tapToStart' element:", e);
  }

  try {
    overlay.remove();
  } catch (e) {
    console.warn("Failed to remove 'overlay' element:", e);
  }

  try {
    container.remove();
  } catch (e) {
    console.warn('Failed to remove camera container:', e);
  }

  try {
    video.remove();
  } catch (e) {
    console.warn("Failed to remove 'video' element:", e);
  }

  document.body.classList.remove('gesture-detector');

  window.ReactNativeWebView?.postMessage?.(
    JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }),
  );
}

// Expose cleanup function
window.__cleanupGestureDetector = cleanup;

window.__startClipCapture = (id: string) => {
  try {
    if (!orchestrator) {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'clip_error', id, reason: 'orchestrator_unavailable' })
      );
      return;
    }
    orchestrator.startClipCapture(id);
  } catch (error) {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'clip_error',
        id,
        reason: 'start_clip_failed',
        details: error instanceof Error ? error.message : String(error),
      })
    );
  }
};

window.__stopClipCapture = (id: string) => {
  try {
    if (!orchestrator) {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'clip_error', id, reason: 'orchestrator_unavailable' })
      );
      return;
    }
    orchestrator.stopClipCapture(id);
  } catch (error) {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'clip_error',
        id,
        reason: 'stop_clip_failed',
        details: error instanceof Error ? error.message : String(error),
      })
    );
  }
};

// Expose system status for debugging
window.__getGestureSystemStatus = () => {
  return orchestrator?.getStatus() || { error: 'Orchestrator not initialized' };
};

// Export for testing
export { GestureRecognitionOrchestrator };
