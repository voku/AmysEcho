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

const container = document.createElement('div');
container.id = 'gestureCameraContainer';

// Create DOM elements
const video = document.createElement('video');
const overlay = document.createElement('canvas');
overlay.id = 'overlay';
video.setAttribute('autoplay', '');
video.setAttribute('playsinline', '');
video.setAttribute('muted', '');

function applyBaseStyles() {
  const docEl = document.documentElement;
  docEl.style.height = '100%';
  docEl.style.width = '100%';

  document.body.style.margin = '0';
  document.body.style.height = '100%';
  document.body.style.width = '100%';
  document.body.style.display = 'flex';
  document.body.style.alignItems = 'center';
  document.body.style.justifyContent = 'center';
  document.body.style.backgroundColor = '#ecfdf5';
  document.body.style.backgroundImage =
    'radial-gradient(circle at 20% 20%, rgba(134, 239, 172, 0.25), transparent 60%), radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.18), transparent 55%)';
  document.body.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  container.style.position = 'relative';
  container.style.width = 'min(96vw, 640px)';
  container.style.height = 'min(72vh, 480px)';
  container.style.maxWidth = '100vw';
  container.style.maxHeight = '100vh';
  container.style.borderRadius = '24px';
  container.style.overflow = 'hidden';
  container.style.boxShadow = '0 18px 40px rgba(15, 23, 42, 0.18)';
  container.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(226, 252, 245, 0.92))';

  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  video.style.display = 'block';
  video.style.backgroundColor = '#f8fafc';
  video.style.filter = 'brightness(1.08)';
  video.style.transition = 'filter 0.2s ease';
  video.style.transformOrigin = 'center';

  const shouldMirrorVideo = mirrorOverlay || facingMode === 'user';
  if (shouldMirrorVideo) {
    video.style.transform = 'scaleX(-1)';
  } else {
    video.style.removeProperty('transform');
  }

  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.pointerEvents = 'none';
  overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
  overlay.style.mixBlendMode = 'screen';
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

  tap.style.position = 'absolute';
  tap.style.bottom = '5%';
  tap.style.left = '50%';
  tap.style.transform = 'translateX(-50%)';
  tap.style.padding = '12px 24px';
  tap.style.background = 'linear-gradient(135deg, #10b981, #22d3ee)';
  tap.style.color = '#0f172a';
  tap.style.fontWeight = '600';
  tap.style.borderRadius = '999px';
  tap.style.boxShadow = '0 12px 24px rgba(14, 116, 144, 0.35)';
  tap.style.cursor = 'pointer';
  tap.style.userSelect = 'none';
  tap.style.transition = 'transform 0.15s ease, box-shadow 0.2s ease';

  tap.addEventListener('pointerdown', () => {
    tap.style.transform = 'translateX(-50%) scale(0.98)';
  });
  tap.addEventListener('pointerup', () => {
    tap.style.transform = 'translateX(-50%)';
  });
  tap.addEventListener('pointerleave', () => {
    tap.style.transform = 'translateX(-50%)';
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
    container.remove();
  } catch (e) {
    console.warn('Failed to remove camera container:', e);
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
