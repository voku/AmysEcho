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

// Expose fflate for compatibility with older WebView bundles
// This would be imported if needed
// window.fflate = { unzip, unzipSync };

import { GestureRecognitionOrchestrator } from './core/GestureRecognitionOrchestrator';

// Initialize configuration
const tapToStartText = window.__tapToStart || '';
const recognizerInitFailed =
  window.__recognizerInitFailed || 'Erkennung konnte nicht gestartet werden: ';
const predictionError = window.__predictionError || 'Vorhersagefehler: ';
const cameraError = window.__cameraError || 'Kamerafehler: ';
const facingMode = window.__facingMode || 'user';
const mirrorOverlay = window.__mirrorOverlay === true;

// Create DOM elements
const video = document.createElement('video');
const overlay = document.createElement('canvas');
overlay.id = 'overlay';
video.setAttribute('autoplay', '');
video.setAttribute('playsinline', '');
video.setAttribute('muted', '');

// Create main orchestrator instance
let orchestrator: GestureRecognitionOrchestrator | null = null;

// Initialize DOM and start gesture recognition
function initDom() {
  document.body.appendChild(video);
  document.body.appendChild(overlay);

  // Create orchestrator
  orchestrator = new GestureRecognitionOrchestrator(video, overlay);

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

  document.body.appendChild(tap);

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

// Auto-start camera if enabled
if (window.__autostartCamera === true && (navigator.userActivation?.hasBeenActive ?? false)) {
  orchestrator?.start()
    .then(() => {
      document.getElementById('tapToStart')?.classList.add('hidden');
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'telemetry', event: 'tap_start_autostart' }),
      );
    })
    .catch((err) => {
      console.warn('Camera autostart failed:', err);
      document.getElementById('tapToStart')?.classList.remove('hidden');
    });
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
  await orchestrator?.cleanup();

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
    video.remove();
  } catch (e) {
    console.warn("Failed to remove 'video' element:", e);
  }

  window.ReactNativeWebView?.postMessage?.(
    JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }),
  );
}

// Expose cleanup function
window.__cleanupGestureDetector = cleanup;

// Expose system status for debugging
window.__getGestureSystemStatus = () => {
  return orchestrator?.getStatus() || { error: 'Orchestrator not initialized' };
};

// Export for testing
export { GestureRecognitionOrchestrator };