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
  captureFrameForTrainer,
  setFrameCaptureEnabled,
  frameCaptureState,
  disposeFrameCapture,
} from '../utils/FrameCaptureManager';
import { sendTelemetryEvent } from '../../telemetry/sendTelemetryEvent';
import { gestureDebugLog } from '../utils/DebugLogger';
import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import { TemporalGestureAnalyzer } from '../utils/TemporalGestureAnalyzer';

// Performance thresholds
const SLOW_FRAME_THRESHOLD_MS = 50;
const OVERLAY_CLEAR_INTERVAL_MS = 300;

export class GestureDetector {
  private static loadTasksVisionImpl: () => Promise<MediaPipeComponents | undefined> = loadTasksVision;

  private config: GestureDetectorConfig;
  private resourceManager: ResourceManager;
  private cameraManager: CameraManager;
  private overlayRenderer: OverlayRenderer;
  private healthMonitor: HealthMonitor;
  private performanceOptimizer: PerformanceOptimizer;
  private temporalAnalyzer: TemporalGestureAnalyzer;
  private video: HTMLVideoElement;
  private gestureRecognizer: GestureRecognizerLike | null = null;
  private running = false;
  private resultCallback?: (results: MediaPipeGestureResult, timestamp: number) => void;
  private lastCaptureAttempt = 0;
  private lastOverlayClearTime = 0;

  constructor(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
    this.video = video;
    this.config = loadConfig();
    this.resourceManager = new ResourceManager();
    this.cameraManager = new CameraManager(video, this.resourceManager);
    this.overlayRenderer = new OverlayRenderer(overlay);
    this.healthMonitor = new HealthMonitor();
    this.performanceOptimizer = new PerformanceOptimizer();
    this.temporalAnalyzer = new TemporalGestureAnalyzer();

    if (this.config.performance?.targetFrameRate) {
      this.performanceOptimizer.setTargetFrameRate(this.config.performance.targetFrameRate);
    }

    if (this.config.processing?.landmarkChangeThreshold) {
      this.performanceOptimizer.setLandmarkChangeThreshold(
        this.config.processing.landmarkChangeThreshold,
      );
    }
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
      void sendTelemetryEvent('camera_start_failed', {
        error: error instanceof Error ? error.message : String(error),
      });

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
        // Update overlay size and alignment to match video and container
        if (this.cameraManager.hasDimensionsChanged()) {
          this.cameraManager.updateVideoDimensions();
        }
        const rect = this.video.getBoundingClientRect();
        this.overlayRenderer.resizeOverlay(rect, this.cameraManager.getVideoDimensions());

        // Perform gesture recognition with timing
        const recognitionStart = performance.now();
        const results = this.gestureRecognizer.recognizeForVideo(this.video, frameStart);
        const recognitionTime = performance.now() - recognitionStart;
        this.performanceOptimizer.recordProcessingTime(recognitionTime);

        gestureDebugLog('recognizer', 'MediaPipe recognition results', () => ({
          hasResults: !!results,
          gestures: results?.gestures?.length ?? 0,
          landmarks: results?.landmarks?.length ?? 0,
          handednesses: results?.handednesses?.length ?? 0,
          recognitionTime: Math.round(recognitionTime),
        }));

        // Call result callback if set
        if (this.resultCallback && results) {
          this.resultCallback(results, frameStart);
        }

        const normalizedLandmarks: number[][][] = results?.landmarks
          ? results.landmarks.map((hand: HandLandmark[]) =>
              hand.map((landmark) => [landmark.x, landmark.y, landmark.z ?? 0]),
            )
          : [];

        // Update temporal analysis for velocity-based optimizations
        // Process all detected hands and use the maximum velocity for adaptive processing
        if (normalizedLandmarks.length > 0) {
          let maxVelocity = 0;
          for (const handLandmarks of normalizedLandmarks) {
            if (handLandmarks) {
              const velocityFeatures = this.temporalAnalyzer.addFrame(
                handLandmarks,
                frameStart,
              );
              maxVelocity = Math.max(maxVelocity, velocityFeatures.averageVelocity);
            }
          }
          // Update performance optimizer with maximum velocity for adaptive processing
          this.performanceOptimizer.updateVelocityScore(maxVelocity);
        }

        this.updateOverlay(normalizedLandmarks, recognitionTime, frameStart);

        if (normalizedLandmarks.length > 0) {
          const captureInterval = frameCaptureState.frameCaptureInterval;
          if (frameStart - this.lastCaptureAttempt >= captureInterval) {
            captureFrameForTrainer(this.video);
            this.lastCaptureAttempt = frameStart;
          }
        }

        // Record successful frame with performance metrics
        this.healthMonitor.recordFrame(frameStart);

        // Log performance warnings for slow frames
        if (recognitionTime > SLOW_FRAME_THRESHOLD_MS) {
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
   * Update overlay rendering based on landmark changes and performance optimization
   */
  private updateOverlay(
    normalizedLandmarks: number[][][],
    recognitionTime: number,
    frameStart: number,
  ): void {
    if (normalizedLandmarks.length > 0) {
      const shouldRedraw = this.performanceOptimizer.shouldRedrawOverlay(
        normalizedLandmarks,
        recognitionTime,
      );

      if (shouldRedraw) {
        this.overlayRenderer.clear();
        this.overlayRenderer.drawHandLandmarks(
          normalizedLandmarks,
          this.config.camera.mirrorOverlay,
        );
        this.lastOverlayClearTime = frameStart;
      }

      return;
    }

    // Reset landmark signature when no hands are detected
    this.performanceOptimizer.resetLandmarkSignature();

    if (frameStart - this.lastOverlayClearTime >= OVERLAY_CLEAR_INTERVAL_MS) {
      this.overlayRenderer.clear();
      this.lastOverlayClearTime = frameStart;
    }
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
    this.temporalAnalyzer.dispose();
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
