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
import { GestureRecognizerLike, MediaPipeGestureResult, HandLandmark, PoseLandmark, FaceLandmark, PoseLandmarkerLike, FaceLandmarkerLike } from '../types/MediaPipeTypes';
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
import { SmoothedFpsMeter } from '../utils/SmoothedFpsMeter';

// Performance thresholds
const SLOW_FRAME_THRESHOLD_MS = 50;
const OVERLAY_CLEAR_INTERVAL_MS = 300;
const FAST_PROCESSING_THRESHOLD_MS = 20; // Same as PerformanceOptimizer.shouldRedrawOverlay
const FPS_TELEMETRY_INTERVAL_FRAMES = 60;

// MediaPipe model URLs
const GESTURE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface GestureRuntimeDelegates {
  gesture: 'GPU' | 'CPU' | null;
  pose: 'GPU' | 'CPU' | 'disabled';
  face: 'GPU' | 'CPU' | 'disabled';
}

export interface GestureRuntimeDiagnostics {
  running: boolean;
  frameCount: number;
  delegates: GestureRuntimeDelegates;
  modules: {
    gestureRecognizerReady: boolean;
    poseLandmarkerReady: boolean;
    faceLandmarkerReady: boolean;
  };
  modelUrls: {
    gesture: string;
    pose: string;
    face: string;
  };
  lastInitializationError: string | null;
}

export class GestureDetector {
  private static loadTasksVisionImpl: () => Promise<MediaPipeComponents | undefined> = loadTasksVision;

  private config: GestureDetectorConfig;
  private resourceManager: ResourceManager;
  private cameraManager: CameraManager;
  private overlayRenderer: OverlayRenderer;
  private healthMonitor: HealthMonitor;
  private performanceOptimizer: PerformanceOptimizer;
  private temporalAnalyzer: TemporalGestureAnalyzer;
  private fpsMeter: SmoothedFpsMeter;
  private video: HTMLVideoElement;
  private gestureRecognizer: GestureRecognizerLike | null = null;
  private poseLandmarker: PoseLandmarkerLike | null = null;
  private faceLandmarker: FaceLandmarkerLike | null = null;
  private running = false;
  private resultCallback?: (results: MediaPipeGestureResult, timestamp: number) => void;
  private lastCaptureAttempt = 0;
  private lastOverlayClearTime = 0;
  private frameCount = 0;
  private runtimeDelegates: GestureRuntimeDelegates = {
    gesture: null,
    pose: 'disabled',
    face: 'disabled',
  };
  private lastInitializationError: string | null = null;

  constructor(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
    this.video = video;
    this.config = loadConfig();
    this.resourceManager = new ResourceManager();
    this.cameraManager = new CameraManager(video, this.resourceManager);
    this.overlayRenderer = new OverlayRenderer(overlay);
    this.healthMonitor = new HealthMonitor();
    this.performanceOptimizer = new PerformanceOptimizer();
    this.temporalAnalyzer = new TemporalGestureAnalyzer();
    this.fpsMeter = new SmoothedFpsMeter();

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
        modelAssetPath: GESTURE_MODEL_URL,
        delegate: 'GPU' as const,
      };

      const gestureOptions = {
        baseOptions,
        runningMode: 'VIDEO' as const,
        numHands: this.config.mediapipe.numHands,
        minHandDetectionConfidence: this.config.mediapipe.minDetectionConfidence,
        minHandPresenceConfidence: this.config.mediapipe.minDetectionConfidence,
        minTrackingConfidence: this.config.mediapipe.minTrackingConfidence,
      };

      try {
        this.gestureRecognizer = await components.GestureRecognizer.createFromOptions(vision, gestureOptions);
        this.runtimeDelegates.gesture = 'GPU';
      } catch (gpuErr) {
        console.warn('GPU delegate failed, falling back to CPU:', gpuErr);
        this.gestureRecognizer = await components.GestureRecognizer.createFromOptions(vision, {
          ...gestureOptions,
          baseOptions: { ...baseOptions, delegate: 'CPU' as const },
        });
        this.runtimeDelegates.gesture = 'CPU';
      }

      // Initialize PoseLandmarker for pose detection (body skeleton)
      if (components.PoseLandmarker) {
        try {
          const poseBaseOptions = {
            modelAssetPath: POSE_MODEL_URL,
            delegate: 'GPU' as const,
          };
          try {
            this.poseLandmarker = await components.PoseLandmarker.createFromOptions(vision, {
              baseOptions: poseBaseOptions,
              runningMode: 'VIDEO',
              numPoses: 1,
            });
            this.runtimeDelegates.pose = 'GPU';
            gestureDebugLog('init', 'PoseLandmarker initialized successfully', undefined, { sampleIntervalMs: 0 });
          } catch (gpuErr) {
            gestureDebugLog('init', 'PoseLandmarker GPU delegate failed, falling back to CPU', () => ({
              error: gpuErr instanceof Error ? gpuErr.message : String(gpuErr),
            }), { sampleIntervalMs: 0, level: 'warn' });
            this.poseLandmarker = await components.PoseLandmarker.createFromOptions(vision, {
              baseOptions: { ...poseBaseOptions, delegate: 'CPU' as const },
              runningMode: 'VIDEO',
              numPoses: 1,
            });
            this.runtimeDelegates.pose = 'CPU';
            gestureDebugLog('init', 'PoseLandmarker initialized with CPU fallback', undefined, { sampleIntervalMs: 0 });
          }
        } catch (poseErr) {
          this.runtimeDelegates.pose = 'disabled';
          gestureDebugLog('init', 'PoseLandmarker initialization failed, pose detection disabled', () => ({
            error: poseErr instanceof Error ? poseErr.message : String(poseErr),
          }), { sampleIntervalMs: 0, level: 'warn' });
        }
      } else {
        this.runtimeDelegates.pose = 'disabled';
        gestureDebugLog('init', 'PoseLandmarker not available in MediaPipe bundle', undefined, { sampleIntervalMs: 0 });
      }

      // Initialize FaceLandmarker for face detection (facial landmarks)
      if (components.FaceLandmarker) {
        try {
          const faceBaseOptions = {
            modelAssetPath: FACE_MODEL_URL,
            delegate: 'GPU' as const,
          };
          try {
            this.faceLandmarker = await components.FaceLandmarker.createFromOptions(vision, {
              baseOptions: faceBaseOptions,
              runningMode: 'VIDEO',
              numFaces: 1,
            });
            this.runtimeDelegates.face = 'GPU';
            gestureDebugLog('init', 'FaceLandmarker initialized successfully', undefined, { sampleIntervalMs: 0 });
          } catch (gpuErr) {
            gestureDebugLog('init', 'FaceLandmarker GPU delegate failed, falling back to CPU', () => ({
              error: gpuErr instanceof Error ? gpuErr.message : String(gpuErr),
            }), { sampleIntervalMs: 0, level: 'warn' });
            this.faceLandmarker = await components.FaceLandmarker.createFromOptions(vision, {
              baseOptions: { ...faceBaseOptions, delegate: 'CPU' as const },
              runningMode: 'VIDEO',
              numFaces: 1,
            });
            this.runtimeDelegates.face = 'CPU';
            gestureDebugLog('init', 'FaceLandmarker initialized with CPU fallback', undefined, { sampleIntervalMs: 0 });
          }
        } catch (faceErr) {
          this.runtimeDelegates.face = 'disabled';
          gestureDebugLog('init', 'FaceLandmarker initialization failed, face detection disabled', () => ({
            error: faceErr instanceof Error ? faceErr.message : String(faceErr),
          }), { sampleIntervalMs: 0, level: 'warn' });
        }
      } else {
        this.runtimeDelegates.face = 'disabled';
        gestureDebugLog('init', 'FaceLandmarker not available in MediaPipe bundle', undefined, { sampleIntervalMs: 0 });
      }

      // Set up video event listener
      const onLoadedData = () => {
        initializeFrameCapture(this.video);
        this.lastCaptureAttempt = 0;
        this.startDetection();
      };
      this.video.addEventListener('loadeddata', onLoadedData);
      this.resourceManager.registerEventListener(this.video, 'loadeddata', onLoadedData);
      this.lastInitializationError = null;

    } catch (error) {
      console.error('Failed to initialize gesture detector:', error);
      this.lastInitializationError = error instanceof Error ? error.message : String(error);
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

    try {
      if (this.cameraManager.isVideoReady()) {
        const frameStart = performance.now();
        this.frameCount += 1;
        const fpsStats = this.fpsMeter.recordFrame(frameStart);
        if (fpsStats && this.frameCount % FPS_TELEMETRY_INTERVAL_FRAMES === 0) {
          void sendTelemetryEvent('detector_fps_sample', {
            fpsAvg: Number(fpsStats.fpsAvg.toFixed(2)),
            fpsP95Window: Number(fpsStats.fpsP95Window.toFixed(2)),
            sampleCount: fpsStats.sampleCount,
          }).catch(() => {});
        }
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
          // Run pose detection using PoseLandmarker (separate from gesture recognition)
          if (this.poseLandmarker) {
            try {
              const poseResults = this.poseLandmarker.detectForVideo(this.video, frameStart);
              if (poseResults?.landmarks) {
                results.poseLandmarks = poseResults.landmarks;
              }
            } catch (poseErr) {
              gestureDebugLog('recognizer', 'Pose detection error', () => ({ error: String(poseErr) }));
            }
          }

          // Run face detection using FaceLandmarker (separate from gesture recognition)
          if (this.faceLandmarker) {
            try {
              const faceResults = this.faceLandmarker.detectForVideo(this.video, frameStart);
              if (faceResults?.faceLandmarks) {
                results.faceLandmarks = faceResults.faceLandmarks;
              }
            } catch (faceErr) {
              gestureDebugLog('recognizer', 'Face detection error', () => ({ error: String(faceErr) }));
            }
          }

          this.resultCallback(results, frameStart);
        }

        const normalizedLandmarks: number[][][] = results?.landmarks
          ? results.landmarks.map((hand: HandLandmark[]) =>
              hand.map((landmark) => [landmark.x, landmark.y, landmark.z ?? 0]),
            )
          : [];

        // Run pose detection for overlay (already done above for results, but we need variables for updateOverlay)
        let poseLandmarks: number[][] = [];
        if (results?.poseLandmarks?.[0]) {
          poseLandmarks = results.poseLandmarks[0].map((landmark: PoseLandmark) => [
            landmark.x ?? 0,
            landmark.y ?? 0,
            landmark.z ?? 0,
            landmark.visibility ?? 0,
          ]);
        }

        // Run face detection for overlay
        let faceLandmarks: number[][] = [];
        if (results?.faceLandmarks?.[0]) {
          faceLandmarks = results.faceLandmarks[0].map((landmark: FaceLandmark) => [
            landmark.x ?? 0,
            landmark.y ?? 0,
            landmark.z ?? 0,
          ]);
        }

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

        this.updateOverlay(
          normalizedLandmarks,
          recognitionTime,
          frameStart,
          poseLandmarks,
          faceLandmarks,
        );

        if (normalizedLandmarks.length > 0) {
          const captureInterval = frameCaptureState.frameCaptureInterval;
          if (frameStart - this.lastCaptureAttempt >= captureInterval) {
            captureFrameForTrainer(this.video);
            this.lastCaptureAttempt = frameStart;
          }
        }

        // Record successful frame with performance metrics
        this.healthMonitor.recordFrame(frameStart);

        // Report total frame cost (detection + overlay + capture) to the camera
        // manager so the adaptive-constraint logic sees accurate per-frame cost.
        const totalDetectorTime = performance.now() - frameStart;
        this.cameraManager.reportProcessingTime(totalDetectorTime);

        // Log performance warnings for slow frames (throttled to avoid log spam)
        if (recognitionTime > SLOW_FRAME_THRESHOLD_MS) {
          gestureDebugLog('performance', 'Slow frame detected', () => ({
            recognitionTime: recognitionTime.toFixed(2),
            thresholdMs: SLOW_FRAME_THRESHOLD_MS,
          }), { sampleIntervalMs: 5000, level: 'warn' });
        }
      }
    } catch (error) {
      gestureDebugLog('error', 'Gesture detection error', () => ({
        error: error instanceof Error ? error.message : String(error),
        runtime: this.getRuntimeDiagnostics(),
      }), { sampleIntervalMs: 1000, level: 'error' });
      this.healthMonitor.recordError();

      // Check if recovery is needed
      if (this.healthMonitor.needsRecovery()) {
        gestureDebugLog('recovery', 'Health monitor indicates recovery needed', undefined, { sampleIntervalMs: 5000, level: 'warn' });
        // Could trigger recovery actions here
      }
    }

    // Continue detection loop - use setTimeout for more controlled frame rate if needed
    requestAnimationFrame(() => this.detectFrame());
  }

  /**
   * Update overlay rendering based on landmark changes and performance optimization
   * For sign language recognition, hand landmarks are prioritized over body/face landmarks
   */
  private updateOverlay(
    normalizedLandmarks: number[][][],
    recognitionTime: number,
    frameStart: number,
    poseLandmarks: number[][],
    faceLandmarks: number[][],
  ): void {
    const hasHandLandmarks = normalizedLandmarks.length > 0;
    const hasPoseLandmarks = poseLandmarks.length > 0;
    const hasFaceLandmarks = faceLandmarks.length > 0;
    const hasAnyLandmarks = hasHandLandmarks || hasPoseLandmarks || hasFaceLandmarks;

    if (hasAnyLandmarks) {
      // For sign language, prioritize hand landmarks for the redraw decision.
      // Only use hand landmarks for the performance optimization signature
      // to ensure hands are always redrawn when they change, regardless of
      // pose/face landmark changes that might otherwise suppress the redraw.
      const shouldRedraw = hasHandLandmarks
        ? this.performanceOptimizer.shouldRedrawOverlay(normalizedLandmarks, recognitionTime)
        : recognitionTime < FAST_PROCESSING_THRESHOLD_MS; // For pose/face only, just use fast processing check

      if (shouldRedraw) {
        this.overlayRenderer.clear();
        // Draw in order: pose first, face second, hands last (on top)
        // This ensures hands are always visible for sign language
        if (hasPoseLandmarks) {
          this.overlayRenderer.drawPoseLandmarks(poseLandmarks, this.config.camera.mirrorOverlay);
        }
        if (hasFaceLandmarks) {
          this.overlayRenderer.drawFaceLandmarks(faceLandmarks, this.config.camera.mirrorOverlay);
        }
        if (hasHandLandmarks) {
          this.overlayRenderer.drawHandLandmarks(
            normalizedLandmarks,
            this.config.camera.mirrorOverlay,
          );
        }
        this.lastOverlayClearTime = frameStart;
      }

      return;
    }

    // Reset landmark signature when no landmarks are detected
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
    this.frameCount = 0;
    this.fpsMeter.reset();

    if (this.gestureRecognizer?.close) {
      await this.gestureRecognizer.close();
    }

    if (this.poseLandmarker?.close) {
      await this.poseLandmarker.close();
    }

    if (this.faceLandmarker?.close) {
      await this.faceLandmarker.close();
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

  getRuntimeDiagnostics(): GestureRuntimeDiagnostics {
    return {
      running: this.running,
      frameCount: this.frameCount,
      delegates: { ...this.runtimeDelegates },
      modules: {
        gestureRecognizerReady: Boolean(this.gestureRecognizer),
        poseLandmarkerReady: Boolean(this.poseLandmarker),
        faceLandmarkerReady: Boolean(this.faceLandmarker),
      },
      modelUrls: {
        gesture: GESTURE_MODEL_URL,
        pose: POSE_MODEL_URL,
        face: FACE_MODEL_URL,
      },
      lastInitializationError: this.lastInitializationError,
    };
  }
}
