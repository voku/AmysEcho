/**
 * Simplified and modular gesture detector
 * Uses the GestureRecognitionOrchestrator for clean separation of concerns
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a, _b;
// Forward script errors to React Native for easier debugging
const onError = (e) => {
    var _a, _b, _c;
    try {
        // Send a generic child-friendly error message instead of technical details
        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
            type: 'error',
            message: 'gesture_processing_error', // Generic identifier for React Native to handle
            // Keep technical details for logging but don't send to UI
            _technical: {
                message: e.message,
                file: e.filename,
                line: e.lineno,
                col: e.colno,
                stack: ((_c = e.error) === null || _c === void 0 ? void 0 : _c.stack) || null,
            },
        }));
    }
    catch (err) {
        console.warn('Failed to forward script error event:', err);
    }
};
window.addEventListener('error', onError);
const onUnhandledRejection = (e) => {
    var _a, _b, _c, _d, _e, _f;
    try {
        // Send a generic child-friendly error message instead of technical details
        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
            type: 'error',
            message: 'gesture_processing_error', // Generic identifier for React Native to handle
            // Keep technical details for logging but don't send to UI
            _technical: {
                message: String((_e = (_d = (_c = e === null || e === void 0 ? void 0 : e.reason) === null || _c === void 0 ? void 0 : _c.message) !== null && _d !== void 0 ? _d : e === null || e === void 0 ? void 0 : e.reason) !== null && _e !== void 0 ? _e : 'unhandledrejection'),
                stack: ((_f = e.reason) === null || _f === void 0 ? void 0 : _f.stack) || null,
            },
        }));
    }
    catch (err) {
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
const recognizerInitFailed = window.__recognizerInitFailed || 'Erkennung konnte nicht gestartet werden: ';
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
let orchestrator = null;
// Initialize DOM and start gesture recognition
function initDom() {
    var _a, _b, _c, _d;
    document.body.appendChild(video);
    document.body.appendChild(overlay);
    // Create orchestrator
    orchestrator = new GestureRecognitionOrchestrator(video, overlay);
    // Initialize orchestrator
    orchestrator.initialize().catch(error => {
        var _a, _b;
        console.error('Failed to initialize gesture recognition:', error);
        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
            type: 'error',
            message: recognizerInitFailed + (error instanceof Error ? error.message : String(error)),
        }));
    });
    // Create tap to start button
    const tap = document.createElement('div');
    tap.id = 'tapToStart';
    tap.innerText = tapToStartText;
    if (window.__autostartCamera === true && ((_b = (_a = navigator.userActivation) === null || _a === void 0 ? void 0 : _a.hasBeenActive) !== null && _b !== void 0 ? _b : false)) {
        tap.classList.add('hidden');
    }
    tap.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({ type: 'telemetry', event: 'tap_start' }));
            if (orchestrator) {
                yield orchestrator.start();
                tap.classList.add('hidden');
            }
        }
        catch (err) {
            (_d = (_c = window.ReactNativeWebView) === null || _c === void 0 ? void 0 : _c.postMessage) === null || _d === void 0 ? void 0 : _d.call(_c, JSON.stringify({
                type: 'error',
                message: cameraError + (err instanceof Error ? err.message : String(err)),
            }));
        }
    }));
    document.body.appendChild(tap);
    (_d = (_c = window.ReactNativeWebView) === null || _c === void 0 ? void 0 : _c.postMessage) === null || _d === void 0 ? void 0 : _d.call(_c, JSON.stringify({ type: 'telemetry', event: 'dom_ready' }));
}
// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDom);
}
else {
    initDom();
}
// Auto-start camera if enabled
if (window.__autostartCamera === true && ((_b = (_a = navigator.userActivation) === null || _a === void 0 ? void 0 : _a.hasBeenActive) !== null && _b !== void 0 ? _b : false)) {
    orchestrator === null || orchestrator === void 0 ? void 0 : orchestrator.start().then(() => {
        var _a, _b, _c;
        (_a = document.getElementById('tapToStart')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
        (_c = (_b = window.ReactNativeWebView) === null || _b === void 0 ? void 0 : _b.postMessage) === null || _c === void 0 ? void 0 : _c.call(_b, JSON.stringify({ type: 'telemetry', event: 'tap_start_autostart' }));
    }).catch((err) => {
        var _a;
        console.warn('Camera autostart failed:', err);
        (_a = document.getElementById('tapToStart')) === null || _a === void 0 ? void 0 : _a.classList.remove('hidden');
    });
}
// Page visibility handling
const onVisibilityChange = () => {
    if (document.hidden) {
        orchestrator === null || orchestrator === void 0 ? void 0 : orchestrator.stop();
    }
    else {
        orchestrator === null || orchestrator === void 0 ? void 0 : orchestrator.start();
    }
};
document.addEventListener('visibilitychange', onVisibilityChange);
// Cleanup function
function cleanup() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        yield (orchestrator === null || orchestrator === void 0 ? void 0 : orchestrator.cleanup());
        // Remove DOM elements
        try {
            const tapEl = document.getElementById('tapToStart');
            if (tapEl)
                tapEl.remove();
        }
        catch (e) {
            console.warn("Failed to remove 'tapToStart' element:", e);
        }
        try {
            overlay.remove();
        }
        catch (e) {
            console.warn("Failed to remove 'overlay' element:", e);
        }
        try {
            video.remove();
        }
        catch (e) {
            console.warn("Failed to remove 'video' element:", e);
        }
        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }));
    });
}
// Expose cleanup function
window.__cleanupGestureDetector = cleanup;
// Expose system status for debugging
window.__getGestureSystemStatus = () => {
    return (orchestrator === null || orchestrator === void 0 ? void 0 : orchestrator.getStatus()) || { error: 'Orchestrator not initialized' };
};
// Export for testing
export { GestureRecognitionOrchestrator };
