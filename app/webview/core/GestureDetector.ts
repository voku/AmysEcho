/**
 * Main Gesture Detector orchestrator
 * Coordinates all gesture detection components
 */

import { loadTasksVision, type MediaPipeComponents } from './MediaPipeLoader';
import { CameraManager } from './CameraManager';
import { OverlayRenderer } from './OverlayRenderer';
import { ResourceManager } from '../utils/ResourceManager';
import { HealthMonitor } from '../utils/HealthMonitor';
import { loadConfig, GestureDetectorConfig } from '../config/GestureConfig';
import { GestureRecognizerLike, MediaPipeGestureResult, HandLandmark } from '../types/MediaPipeTypes';
import {
  initializeFrameCapture,
  captureFrameForOpenAI,
  setFrameCaptureEnabled,
  frameCaptureState,
  disposeFrameCapture,
} from '../utils/FrameCaptureManager';

export class GestureDetector {
  private static loadTasksVisionImpl: () => Promise<MediaPipeComponents | undefined> = loadTasksVision;

  private config: GestureDetectorConfig;
  private resourceManager: ResourceManager;
  private cameraManager: CameraManager;
  private overlayRenderer: OverlayRenderer;
  private healthMonitor: HealthMonitor;
  private video: HTMLVideoElement;
  private overlay: HTMLCanvasElement;
  private gestureRecognizer: GestureRecognizerLike | null = null;
  private running = false;
  private resultCallback?: (results: MediaPipeGestureResult, timestamp: number) => void;
  private lastCaptureAttempt = 0;

  constructor(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
    this.video = video;
    this.overlay = overlay;
    this.config = loadConfig();
    this.resourceManager = new ResourceManager();
    this.cameraManager = new CameraManager(video, this.resourceManager);
    this.overlayRenderer = new OverlayRenderer(overlay);
    this.healthMonitor = new HealthMonitor();
  }

  /**
   * Allows tests to override the MediaPipe loader implementation
   */
  static setLoadTasksVisionImplementation(
    loader: (() => Promise<MediaPipeComponents | undefined>) | null,
  ): void {
    GestureDetector.loadTasksVisionImpl = loader ?? loadTasksVision;
  }

  /**
   * Set callback for gesture results
   */
  setResultCallback(callback: (results: MediaPipeGestureResult, timestamp: number) => void): void {
    this.resultCallback = callback;
  }

  /**
   * Initialize the gesture detector
   */
  async initialize(): Promise<void> {
    try {
      // Load MediaPipe components
      const components: MediaPipeComponents | undefined = await GestureDetector.loadTasksVisionImpl();

      if (!components) {
        throw new Error('Tasks Vision components not available');
      }

      // Create gesture recognizer
      const filesetResolver =
        components.FilesetResolver ?? (window as any)?.fileset_resolver?.FilesetResolver;

      if (!filesetResolver || typeof filesetResolver.forVisionTasks !== 'function') {
        throw new Error('Tasks Vision FilesetResolver not available');
      }

      const vision = await filesetResolver.forVisionTasks(components.wasmBase);
      const baseOptions = {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
        delegate: 'GPU' as const,
      };

      try {
        this.gestureRecognizer = await components.GestureRecognizer.createFromOptions(vision, {
          baseOptions,
          runningMode: 'VIDEO',
          numHands: 2,
        });
      } catch (gpuErr) {
        console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
        this.gestureRecognizer = await components.GestureRecognizer.createFromOptions(vision, {
          baseOptions: { ...baseOptions, delegate: 'CPU' as const },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      }

      // Set up video event listener
      const onLoadedData = () => {
        initializeFrameCapture(this.video);
        this.lastCaptureAttempt = 0;
        this.startDetection();
      };
      this.video.addEventListener('loadeddata', onLoadedData);
      this.resourceManager.registerEventListener(this.video, 'loadeddata', onLoadedData);

    } catch (error) {
      console.error('Failed to initialize gesture detector:', error);
      throw error;
    }
  }

  /**
   * Start camera and detection
   */
  async start(): Promise<void> {
    try {
      await this.cameraManager.startCamera();
      setFrameCaptureEnabled(true);
    } catch (error) {
      console.error('Failed to start camera:', error);

      // Send camera error telemetry
      try {
        (window as any).ReactNativeWebView?.postMessage?.(
          JSON.stringify({
            type: 'telemetry',
            event: 'camera_start_failed',
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          }),
        );
      } catch (telemetryErr) {
        console.warn('Failed to send camera error telemetry:', telemetryErr);
      }

      // Continue with gesture detector initialization even if camera fails
      // This allows the system to work with pre-recorded video or fallback modes
      console.warn('Continuing gesture detector initialization despite camera failure');
    }
  }

  /**
   * Start gesture detection loop
   */
  private startDetection(): void {
    if (this.running) return;
    this.running = true;
    this.detectFrame();
  }

  /**
   * Main detection loop with performance optimizations
   */
  private detectFrame(): void {
    if (!this.running || !this.gestureRecognizer) return;

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

        console.log('MediaPipe recognition results:', {
          hasResults: !!results,
          gestures: results?.gestures?.length || 0,
          landmarks: results?.landmarks?.length || 0,
          handednesses: results?.handednesses?.length || 0,
          recognitionTime: Math.round(recognitionTime)
        });

        // Call result callback if set
        if (this.resultCallback && results) {
          this.resultCallback(results, frameStart);
        }

        if (results?.landmarks) {
          const normalizedLandmarks: number[][][] = results.landmarks.map((hand: HandLandmark[]) =>
            hand.map((landmark) => [landmark.x, landmark.y, landmark.z ?? 0]),
          );
          // Optimize overlay updates - only redraw when necessary
          const shouldRedraw = this.shouldRedrawOverlay(results, recognitionTime);
          if (shouldRedraw) {
            this.overlayRenderer.clear();
            this.overlayRenderer.drawHandLandmarks(normalizedLandmarks, this.config.camera.mirrorOverlay);
          }
          const captureInterval = frameCaptureState.frameCaptureInterval;
          if (frameStart - this.lastCaptureAttempt >= captureInterval) {
            captureFrameForOpenAI(this.video);
            this.lastCaptureAttempt = frameStart;
          }
        }

        // Record successful frame with performance metrics
        this.healthMonitor.recordFrame(frameStart);

        // Log performance warnings for slow frames
        if (recognitionTime > 50) { // More than 50ms is slow
          console.warn(`Slow frame detected: ${recognitionTime.toFixed(2)}ms`);
        }
      }
    } catch (error) {
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
  private shouldRedrawOverlay(results: MediaPipeGestureResult, recognitionTime: number): boolean {
    // Always redraw if we have landmarks
    if (results?.landmarks && results.landmarks.length > 0) {
      return true;
    }

    // Redraw periodically even without landmarks to clear stale overlays
    // Use frame count or time-based approach
    return recognitionTime < 30; // Only redraw if recognition was fast
  }

  /**
   * Stop detection and cleanup
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.gestureRecognizer?.close) {
      await this.gestureRecognizer.close();
    }

    await this.cameraManager.stopCamera();
    await this.resourceManager.dispose();
    setFrameCaptureEnabled(false);
    disposeFrameCapture();
  }

  getCameraStream(): MediaStream | null {
    return this.cameraManager.getStream();
  }

  /**
   * Get current configuration
   */
  getConfig(): GestureDetectorConfig {
    return this.config;
  }
}
