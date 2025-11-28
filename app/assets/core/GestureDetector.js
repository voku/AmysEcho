/**
 * Main Gesture Detector orchestrator
 * Coordinates all gesture detection components
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
import { loadTasksVision } from './MediaPipeLoader';
import { CameraManager } from './CameraManager';
import { OverlayRenderer } from './OverlayRenderer';
import { ResourceManager } from '../utils/ResourceManager';
import { HealthMonitor } from '../utils/HealthMonitor';
import { loadConfig } from '../config/GestureConfig';
export class GestureDetector {
    constructor(video, overlay) {
        this.gestureRecognizer = null;
        this.running = false;
        this.video = video;
        this.overlay = overlay;
        this.config = loadConfig();
        this.resourceManager = new ResourceManager();
        this.cameraManager = new CameraManager(video, this.resourceManager);
        this.overlayRenderer = new OverlayRenderer(overlay);
        this.healthMonitor = new HealthMonitor();
    }
    /**
     * Set callback for gesture results
     */
    setResultCallback(callback) {
        this.resultCallback = callback;
    }
    /**
     * Initialize the gesture detector
     */
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Load MediaPipe components
                const components = yield loadTasksVision();
                // Create gesture recognizer
                const vision = yield components.FilesetResolver.forVisionTasks(components.wasmBase);
                const baseOptions = {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
                    delegate: 'GPU',
                };
                try {
                    this.gestureRecognizer = yield components.GestureRecognizer.createFromOptions(vision, {
                        baseOptions,
                        runningMode: 'VIDEO',
                        numHands: 2,
                    });
                }
                catch (gpuErr) {
                    console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
                    this.gestureRecognizer = yield components.GestureRecognizer.createFromOptions(vision, {
                        baseOptions: Object.assign(Object.assign({}, baseOptions), { delegate: 'CPU' }),
                        runningMode: 'VIDEO',
                        numHands: 2,
                    });
                }
                // Set up video event listener
                this.video.addEventListener('loadeddata', () => this.startDetection());
                this.resourceManager.registerEventListener(this.video, 'loadeddata', () => this.startDetection());
            }
            catch (error) {
                console.error('Failed to initialize gesture detector:', error);
                throw error;
            }
        });
    }
    /**
     * Start camera and detection
     */
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.cameraManager.startCamera();
        });
    }
    /**
     * Start gesture detection loop
     */
    startDetection() {
        if (this.running)
            return;
        this.running = true;
        this.detectFrame();
    }
    /**
     * Main detection loop with performance optimizations
     */
    detectFrame() {
        if (!this.running || !this.gestureRecognizer)
            return;
        const frameStart = performance.now();
        try {
            if (this.cameraManager.isVideoReady()) {
                // Update overlay size if video dimensions changed (throttled)
                if (this.cameraManager.hasDimensionsChanged()) {
                    this.cameraManager.updateVideoDimensions();
                    const rect = this.video.getBoundingClientRect();
                    this.overlayRenderer.resizeOverlay(rect);
                }
                // Perform gesture recognition with timing
                const recognitionStart = performance.now();
                const results = this.gestureRecognizer.recognizeForVideo(this.video, frameStart);
                const recognitionTime = performance.now() - recognitionStart;
                // Call result callback if set
                if (this.resultCallback && results) {
                    this.resultCallback(results, frameStart);
                }
                if (results === null || results === void 0 ? void 0 : results.landmarks) {
                    // Optimize overlay updates - only redraw when necessary
                    const shouldRedraw = this.shouldRedrawOverlay(results, recognitionTime);
                    if (shouldRedraw) {
                        this.overlayRenderer.clear();
                        this.overlayRenderer.drawHandLandmarks(results.landmarks, this.config.camera.mirrorOverlay);
                    }
                }
                // Record successful frame with performance metrics
                this.healthMonitor.recordFrame(frameStart);
                // Log performance warnings for slow frames
                if (recognitionTime > 50) { // More than 50ms is slow
                    console.warn(`Slow frame detected: ${recognitionTime.toFixed(2)}ms`);
                }
            }
        }
        catch (error) {
            console.error('Gesture detection error:', error);
            this.healthMonitor.recordError();
            // Check if recovery is needed
            if (this.healthMonitor.needsRecovery()) {
                console.warn('Health monitor indicates recovery needed');
                // Could trigger recovery actions here
            }
        }
        // Continue detection loop - use setTimeout for more controlled frame rate if needed
        requestAnimationFrame(() => this.detectFrame());
    }
    /**
     * Determine if overlay should be redrawn to optimize performance
     */
    shouldRedrawOverlay(results, recognitionTime) {
        // Always redraw if we have landmarks
        if ((results === null || results === void 0 ? void 0 : results.landmarks) && results.landmarks.length > 0) {
            return true;
        }
        // Redraw periodically even without landmarks to clear stale overlays
        // Use frame count or time-based approach
        return recognitionTime < 30; // Only redraw if recognition was fast
    }
    /**
     * Stop detection and cleanup
     */
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.running = false;
            if ((_a = this.gestureRecognizer) === null || _a === void 0 ? void 0 : _a.close) {
                yield this.gestureRecognizer.close();
            }
            yield this.cameraManager.stopCamera();
            yield this.resourceManager.dispose();
        });
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return this.config;
    }
}
