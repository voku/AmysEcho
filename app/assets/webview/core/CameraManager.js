/**
 * Camera management for gesture detection
 * Handles video stream initialization and cleanup
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
export class CameraManager {
    constructor(video, resourceManager) {
        this.lastVideoWidth = 0;
        this.lastVideoHeight = 0;
        this.video = video;
        this.resourceManager = resourceManager;
    }
    /**
     * Start camera stream
     */
    startCamera() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const facingMode = window.__facingMode || 'user';
            const stream = yield navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            this.video.srcObject = stream;
            this.resourceManager.registerMediaStream(stream);
            // Set up video properties
            this.video.muted = true;
            this.video.setAttribute('autoplay', '');
            this.video.setAttribute('playsinline', '');
            this.video.setAttribute('muted', '');
            yield this.video.play();
            // Update dimensions
            this.updateVideoDimensions();
            // Send telemetry
            const tracks = stream.getVideoTracks();
            try {
                (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
                    type: 'telemetry',
                    event: 'camera_started',
                    tracks: tracks.map((t) => t.label),
                }));
            }
            catch (err) {
                console.warn("Failed to send 'camera_started' telemetry event:", err);
            }
        });
    }
    /**
     * Stop camera stream
     */
    stopCamera() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.video.pause();
            }
            catch (e) {
                console.warn('Failed to pause video during cleanup:', e);
            }
            try {
                const s = this.video.srcObject;
                if (s) {
                    s.getTracks().forEach((t) => t.stop());
                    this.video.srcObject = null;
                }
            }
            catch (e) {
                console.warn('Failed to stop camera stream:', e);
            }
        });
    }
    /**
     * Update video dimensions tracking
     */
    updateVideoDimensions() {
        this.lastVideoWidth = this.video.videoWidth;
        this.lastVideoHeight = this.video.videoHeight;
    }
    /**
     * Check if video dimensions have changed
     */
    hasDimensionsChanged() {
        return (this.video.videoWidth !== this.lastVideoWidth ||
            this.video.videoHeight !== this.lastVideoHeight);
    }
    /**
     * Get current video dimensions
     */
    getVideoDimensions() {
        return {
            width: this.video.videoWidth,
            height: this.video.videoHeight
        };
    }
    /**
     * Check if video is ready for processing
     */
    isVideoReady() {
        return (this.video.currentTime > 0 &&
            !this.video.paused &&
            !this.video.ended &&
            this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
    }
}
