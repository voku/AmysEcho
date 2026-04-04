/**
 * Main orchestrator for gesture recognition system
 * Coordinates all gesture detection components and manages the processing pipeline
 */

import { GestureDetector, type GestureRuntimeDiagnostics } from './GestureDetector';
import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import { MemoryOptimizer } from '../utils/MemoryOptimizer';
import {
  ProcessingPipeline,
  ProcessingContext,
  ProcessingResult,
} from '../utils/ProcessingPipeline';
import { OptimizedTremorCompensator } from '../utils/OptimizedTremorCompensator';
import { GestureSizeNormalizer } from '../gestureProcessing';
import { PartialGestureDetector } from '../gestureProcessing';
import { ErrorRecoveryManager } from '../utils/ErrorRecoveryManager';
import { FallbackGestureDetector } from '../core/FallbackGestureDetector';
import { HandStabilityAssistant } from '../core/HandStabilityAssistant';
import { BatteryMonitor } from '../core/BatteryMonitor';
import { loadConfig, GestureDetectorConfig } from '../config/GestureConfig';
import {
  LANDMARK_STREAM_SCHEMA_VERSION,
  type LandmarkStreamPayload,
  MediaPipeGestureResult,
  TwoHandGesture,
} from '../types/MediaPipeTypes';
import { mapMediaPipeResult, NormalizedMediaPipeResult } from '../utils/mapMediaPipeResults';
import { messageBatcher, FRAME_LATENCY_SAMPLE_INTERVAL } from '../utils/MessageBatcher';
import { captureFrameForTrainer, getLastCapturedFrame, setFrameCaptureEnabled } from '../utils/FrameCaptureManager';
import { FallbackClipRecorder, FallbackClipResult } from '../utils/FallbackClipRecorder';
import { sendTelemetryEvent } from '../../telemetry/sendTelemetryEvent';
import { gestureDebugLog } from '../utils/DebugLogger';
import { MultimodalSmoother } from '../utils/MultimodalSmoother';
import { SignVariationTracker, type GestureLandmarks } from '../../services/signVariationTracker';
import { assessLandmarkConfidence } from '../utils/landmarkConfidencePolicy';
import {
  FallbackProcessingStep,
  GestureDetectionStep,
  LandmarkPreprocessingStep,
  MLP_CONFIDENCE_THRESHOLD,
  PartialGestureAnalysisStep,
  ResultProcessingStep,
  StabilityAnalysisStep,
} from './ProcessingSteps';
import { LandmarkTemplateDetector } from '../landmarkTemplateDetector';

// Default fallback confidence threshold
const FALLBACK_CONFIDENCE_THRESHOLD = 0.35;

interface GestureMessagePayload {
  type: 'gesture';
  gesture?: string | TwoHandGesture | null;
  confidence: number;
  landmarks: number[][][];
  handednesses: string[];
  timestamp: number;
  isFallback?: boolean;
  systemHealth: ReturnType<ErrorRecoveryManager['getHealthStatus']>;
  processingTime: number;
  stepsExecuted: string[];
  skippedSteps: string[];
  thresholds: {
    fallback: number;
    mlp: number;
  };
  detectionMethod?: string;
  mlpDecision?: ProcessingResult['metadata'] extends infer T
    ? T extends { mlpDecision?: infer D }
      ? D
      : never
    : never;
  mlp?: ProcessingResult['metadata'] extends infer T
    ? T extends { mlp?: infer M }
      ? M
      : never
    : never;
  frameCapture?: string | null;
}

const FRAME_BATCH_INTERVAL_MS_250 = 250;
const FRAME_BUFFER_LIMIT = 24;
const FRAME_CAPTURE_THROTTLE = 5; // Capture every 5th frame to optimize memory usage (inspired by Gemini click-dummy)
const DEFAULT_LANDMARK_INTERVAL_MS = 120;
const MIN_LANDMARK_INTERVAL_MS = 80;
const MAX_LANDMARK_INTERVAL_MS = 320;

// Adaptive landmark interval calculation constants
const PROCESSING_TIME_MULTIPLIER = 1.6;
const ADAPTIVE_PADDING_MS = 80;
const BASE_PADDING_MS = 40;

interface FrameBatchEntry {
  frame: string;
  landmarks: number[][][];
  handednesses: string[];
  poseLandmarks: number[][];
  faceLandmarks: number[][];
  timestamp: number;
}

interface MediaRecorderClipState {
  mode: 'media_recorder';
  id: string;
  recorder: MediaRecorder;
  chunks: BlobPart[];
  startedAt: number;
  mimeType: string;
  frameCount: number;
  timeoutHandle?: number | null;
  aborted: boolean;
  timesliceMs: number | null;
  requestDataInterval?: number | null;
}

interface FallbackRecorderClipState {
  mode: 'fallback';
  id: string;
  recorder: FallbackClipRecorder;
  startedAt: number;
  timeoutHandle?: number | null;
  aborted: boolean;
}

type ClipCaptureState = MediaRecorderClipState | FallbackRecorderClipState;

type OrchestratorDependencies = {
  createGestureDetector?: (video: HTMLVideoElement, overlay: HTMLCanvasElement) => GestureDetector;
  errorRecoveryManager?: ErrorRecoveryManager;
};

export class GestureRecognitionOrchestrator {
  private gestureDetector: GestureDetector | null = null;
  private performanceOptimizer: PerformanceOptimizer;
  private memoryOptimizer: MemoryOptimizer;
  private processingPipeline: ProcessingPipeline;
  private tremorCompensator!: OptimizedTremorCompensator;
  private sizeNormalizer!: GestureSizeNormalizer;
  private partialDetector!: PartialGestureDetector;
  private errorRecoveryManager: ErrorRecoveryManager;
  private fallbackDetector!: FallbackGestureDetector;
  private handStabilityAssistant!: HandStabilityAssistant;
  private batteryMonitor!: BatteryMonitor;
  private config: GestureDetectorConfig;

  private isInitialized = false;
  private isRunning = false;
  private frameSampleCounter = 0;
  private lastLandmarkSendTime = 0;
  private landmarkSendIntervalMs = DEFAULT_LANDMARK_INTERVAL_MS;
  private frameBuffer: FrameBatchEntry[] = [];
  private frameBatchTimer: number | null = null;
  private clipCaptureState: ClipCaptureState | null = null;
  private frameCaptureCounter = 0; // Counter for frame throttling
  private multimodalSmoother: MultimodalSmoother;
  private variationTracker: SignVariationTracker;
  private variationCleanupCounter = 0;
  private templateDetector: LandmarkTemplateDetector;
  private readonly VARIATION_CLEANUP_INTERVAL = 100; // Run cleanup every 100 gestures

  private readonly createGestureDetector: (video: HTMLVideoElement, overlay: HTMLCanvasElement) => GestureDetector;

  constructor(
    private video: HTMLVideoElement,
    private overlay: HTMLCanvasElement,
    dependencies: OrchestratorDependencies = {}
  ) {
    this.performanceOptimizer = new PerformanceOptimizer();
    this.memoryOptimizer = MemoryOptimizer.getInstance();
    this.processingPipeline = new ProcessingPipeline();
    this.config = loadConfig();
    this.multimodalSmoother = new MultimodalSmoother();
    this.variationTracker = new SignVariationTracker();
    this.templateDetector = new LandmarkTemplateDetector();

    this.createGestureDetector =
      dependencies.createGestureDetector ?? ((videoEl, overlayEl) => new GestureDetector(videoEl, overlayEl));
    this.errorRecoveryManager = dependencies.errorRecoveryManager ?? new ErrorRecoveryManager();

    // Initialize components
    this.initializeComponents();
    this.setupProcessingPipeline();
  }

  /**
   * Initialize all gesture recognition components
   */
  private initializeComponents(): void {
    this.tremorCompensator = new OptimizedTremorCompensator();
    this.sizeNormalizer = new GestureSizeNormalizer();
    this.partialDetector = new PartialGestureDetector();
    this.fallbackDetector = new FallbackGestureDetector();
    this.handStabilityAssistant = new HandStabilityAssistant();
    this.batteryMonitor = new BatteryMonitor();

    // Configure components
    this.sizeNormalizer.setTolerance(this.config.processing?.sizeTolerance ?? 0.3);
    this.partialDetector.setThreshold(this.config.processing?.partialThreshold ?? 0.6);
  }

  /**
   * Set up the processing pipeline with all necessary steps
   */
  private setupProcessingPipeline(): void {
    // Add processing steps in order of execution
    this.processingPipeline.addStep(new LandmarkPreprocessingStep(this.sizeNormalizer, this.tremorCompensator));
    this.processingPipeline.addStep(new StabilityAnalysisStep(this.handStabilityAssistant));
    this.processingPipeline.addStep(new GestureDetectionStep(this.config, this.templateDetector));
    this.processingPipeline.addStep(new PartialGestureAnalysisStep(this.partialDetector));
    this.processingPipeline.addStep(new FallbackProcessingStep(this.fallbackDetector, this.errorRecoveryManager));
    this.processingPipeline.addStep(new ResultProcessingStep());

    // Configure pipeline optimization
    this.processingPipeline.configureOptimization({
      targetFrameRate: this.config.performance?.targetFrameRate ?? 30,
      landmarkChangeThreshold: this.config.processing?.landmarkChangeThreshold ?? 0.01,
      enableMemoryOptimization: true
    });
  }

  /**
   * Initialize the gesture recognition system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create and initialize the main gesture detector
      this.gestureDetector = this.createGestureDetector(this.video, this.overlay);

      // Set up result callback
      this.gestureDetector.setResultCallback((results, timestamp) => {
        this.handleGestureResults(results, timestamp);
      });

      await this.gestureDetector.initialize();

      // Start monitoring systems
      this.batteryMonitor.startMonitoring();
      setFrameCaptureEnabled(true, 150);

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize gesture recognition orchestrator:', error);
      throw error;
    }
  }

  /**
   * Start gesture recognition
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) return;

    await this.gestureDetector?.start();
    this.isRunning = true;
  }

  /**
   * Stop gesture recognition
   */
  async stop(force = false): Promise<void> {
    const shouldPerformCleanup = this.isRunning || force;
    if (!shouldPerformCleanup) return;

    this.cancelClipCapture();
    this.flushFrameBatch(true);
    this.frameBuffer = [];

    await this.gestureDetector?.stop();
    // Force a fresh initialization on the next start so MediaPipe reloads and getUserMedia runs again.
    // Without this reset, restarting after a stop could leave the camera stream detached even though
    // the orchestrator reported a running state.
    this.resetLifecycleState();
  }

  /**
   * Update the landmark templates used for custom gesture detection.
   * Call this after fetching templates from the server.
   */
  setLandmarkTemplates(templates: import('../landmarkTemplateDetector').LandmarkTemplate[]): void {
    this.templateDetector.setTemplates(templates);
  }

  /**
   * Handle gesture detection results
   */
  private async handleGestureResults(results: MediaPipeGestureResult, timestamp: number): Promise<void> {
    try {
      // Check if we should process this frame
      if (!this.performanceOptimizer.shouldProcessFrame()) {
        return;
      }

      // Prepare processing context
      const normalized = mapMediaPipeResult(results);
      this.collectFrameForBatch(normalized);
      const smoothed = this.multimodalSmoother.smooth(normalized, timestamp);

      const context: ProcessingContext = {
        landmarks: smoothed.landmarks,
        timestamp,
        processingStep: 'gesture_results',
        skipExpensiveSteps: this.shouldSkipExpensiveSteps(),
        rawResults: results,
        rawLandmarks: smoothed.landmarks,
        handednesses: smoothed.handednesses,
        normalizedResults: smoothed,
      };

      // Execute processing pipeline
      const processingResult = await this.processingPipeline.executePipeline(context);

      // Send landmarks for preview and recognition at throttled rate
      const hasLandmarks = smoothed.landmarks.some(hand => hand.length > 0);
      const now = Date.now();
      if (hasLandmarks && now - this.lastLandmarkSendTime >= this.landmarkSendIntervalMs) {
        this.sendLandmarks(smoothed.landmarks, smoothed.handednesses, timestamp);
        this.lastLandmarkSendTime = now;
      }

      // Send gesture results if detected
      const hasGestureResult =
        Boolean(processingResult.gesture) ||
        (processingResult.confidence ?? 0) > 0.3 || // Lower threshold for fallback gestures
        Boolean(processingResult.fallback?.gesture);

      gestureDebugLog('results', 'Gesture result check', () => ({
        hasGestureResult,
        gesture: processingResult.gesture,
        confidence: processingResult.confidence,
        hasFallback: Boolean(processingResult.fallback?.gesture),
      }));

      if (hasGestureResult) {
        gestureDebugLog('results', 'Sending gesture result', () => ({
          gesture: processingResult.gesture,
          confidence: processingResult.confidence,
          isFallback: processingResult.isFallback,
          stepsExecuted: processingResult.stepsExecuted,
        }), { sampleIntervalMs: 3000 });
        this.sendGestureResult(processingResult, results, smoothed);
      } else if (hasLandmarks) {
        // Send landmark data so the app can log uncertain frames and build training datasets
        this.sendGestureResult({
          gesture: null,
          confidence: 0,
          landmarks: smoothed.landmarks,
          metadata: {
            method: 'none',
            perHand: [],
            handednesses: smoothed.handednesses,
            mlp: null,
            twoHand: null
          },
          timestamp,
          isFallback: false,
          systemHealth: this.errorRecoveryManager.getHealthStatus(),
          processingTime: processingResult.processingTime,
          stepsExecuted: processingResult.stepsExecuted,
          skippedSteps: processingResult.skippedSteps,
        }, results, smoothed);
      }

      // Update performance metrics
      this.performanceOptimizer.recordProcessingTime(processingResult.processingTime);
      this.updateLandmarkInterval();

      this.frameSampleCounter += 1;
      if (this.frameSampleCounter >= FRAME_LATENCY_SAMPLE_INTERVAL) {
        const diagnostics = this.performanceOptimizer.getDiagnostics();
        if (diagnostics.averageProcessingTime > 30) {
          messageBatcher.forceFlush();
        }
        this.frameSampleCounter = 0;
      }

    } catch (error) {
      console.error('Error handling gesture results:', error);
      this.errorRecoveryManager.recordFailure(error as Error, 'gesture_result_processing');
    }
  }

  private collectFrameForBatch(normalized: NormalizedMediaPipeResult): void {
    try {
      const hasHandLandmarks = normalized.landmarks.some((hand) => hand.length > 0);
      if (!hasHandLandmarks) {
        return; // Skip batching when no hands are visible
      }

      // Increment counter and throttle frame capture to every Nth frame
      // This reduces memory usage during training (inspired by Gemini click-dummy)
      this.frameCaptureCounter += 1;
      if (this.frameCaptureCounter % FRAME_CAPTURE_THROTTLE !== 0) {
        return; // Skip this frame
      }

      const frameDataUrl = captureFrameForTrainer(this.video);
      if (!frameDataUrl) {
        return;
      }

      // Note: Training batches intentionally use unsmoothed normalized landmarks to avoid
      // introducing smoothing artifacts into the training data. Real-time recognition uses
      // smoothed landmarks for stability, but training models should learn from raw data.
      const entry: FrameBatchEntry = {
        frame: frameDataUrl,
        landmarks: normalized.landmarks,
        handednesses: normalized.handednesses,
        poseLandmarks: normalized.poseLandmarks,
        faceLandmarks: normalized.faceLandmarks,
        timestamp: Date.now(),
      };

      this.frameBuffer.push(entry);
      if (this.frameBuffer.length > FRAME_BUFFER_LIMIT) {
        this.frameBuffer = this.frameBuffer.slice(-FRAME_BUFFER_LIMIT);
      }

      if (this.clipCaptureState?.mode === 'media_recorder') {
        this.clipCaptureState.frameCount += 1;
      }

      if (this.frameBatchTimer === null) {
        this.frameBatchTimer = window.setTimeout(() => this.flushFrameBatch(), FRAME_BATCH_INTERVAL_MS_250);
      }
    } catch (error) {
      console.warn('Failed to collect frame batch:', error);
    }
  }

  private flushFrameBatch(sendFullBuffer = false): void {
    if (this.frameBatchTimer !== null) {
      clearTimeout(this.frameBatchTimer);
      this.frameBatchTimer = null;
    }

    if (this.frameBuffer.length === 0) {
      return;
    }

    const entries = sendFullBuffer
      ? [...this.frameBuffer]
      : this.frameBuffer.slice(-Math.min(this.frameBuffer.length, 6));

    try {
      const payload = {
        type: 'FRAME_BATCH',
        landmarks: entries.map((entry) => entry.landmarks),
        handednesses: entries.map((entry) => entry.handednesses),
        poseLandmarks: entries.map((entry) => entry.poseLandmarks),
        faceLandmarks: entries.map((entry) => entry.faceLandmarks),
        timestamps: entries.map((entry) => entry.timestamp),
        frames: entries.map((entry) => entry.frame),
      } as const;

      /*
        Example payload posted back to React Native:
        {
          "type": "FRAME_BATCH",
          "landmarks": [...],
          "handednesses": [...],
          "timestamps": [...],
          "frames": ["data:image/jpeg;base64,..."]
        }
      */
      messageBatcher.queueMessage(payload, { flushImmediately: false });
    } catch (error) {
      console.warn('Failed to enqueue frame batch payload:', error);
    }

    if (!sendFullBuffer && this.frameBuffer.length > FRAME_BUFFER_LIMIT) {
      this.frameBuffer = this.frameBuffer.slice(-FRAME_BUFFER_LIMIT);
    }
  }

  startClipCapture(requestId: string): void {
    if (this.clipCaptureState) {
      this.sendClipError(requestId, 'capture_in_progress');
      return;
    }

    // Validate video element is ready for both MediaRecorder and fallback paths
    if (!this.video || this.video.videoWidth === 0 || this.video.videoHeight === 0) {
      this.sendClipError(requestId, 'video_not_ready');
      return;
    }

    if (typeof window.MediaRecorder === 'undefined') {
      this.startFallbackClipCapture(requestId);
      return;
    }

    const stream = this.gestureDetector?.getCameraStream();
    if (!stream) {
      this.sendClipError(requestId, 'no_camera_stream');
      return;
    }

    const recorderResult = this.createMediaRecorder(stream);
    if ('errorReason' in recorderResult) {
      if (recorderResult.errorReason === 'media_recorder_not_supported') {
        this.startFallbackClipCapture(requestId);
        return;
      }
      this.sendClipError(requestId, recorderResult.errorReason, recorderResult.errorDetails);
      return;
    }

    const { recorder, mimeType } = recorderResult;

    const state: ClipCaptureState = {
      mode: 'media_recorder',
      id: requestId,
      recorder,
      chunks: [],
      startedAt: Date.now(),
      mimeType: recorder.mimeType || mimeType || this.getPlatformDefaultMime(),
      frameCount: 0,
      timeoutHandle: null,
      aborted: false,
      timesliceMs: null,
      requestDataInterval: null,
    };

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        state.chunks.push(event.data);
      }
    };

    recorder.onerror = (event: Event) => {
      const error = (event as { error?: unknown }).error;
      state.aborted = true;
      this.sendClipError(requestId, 'recorder_error', error);
      this.resetClipCapture(true);
    };

    recorder.onstop = () => {
      this.handleClipStop(state);
    };

    const startResult = this.startRecorder(recorder);
    if (!startResult.ok) {
      state.aborted = true;
      this.sendClipError(requestId, 'recorder_start_failed', startResult.error);
      this.resetClipCapture(true);
      return;
    }

    state.timesliceMs = startResult.timesliceMs;

    if (state.timesliceMs === null && typeof recorder.requestData === 'function') {
      state.requestDataInterval = window.setInterval(() => {
        if (state.aborted || state.recorder.state !== 'recording') {
          if (state.requestDataInterval) {
            clearInterval(state.requestDataInterval);
            state.requestDataInterval = null;
          }
          return;
        }

        try {
          state.recorder.requestData();
        } catch (intervalError) {
          console.warn('Failed to request clip data during recording:', intervalError);
        }
      }, 1000);
    }

    state.timeoutHandle = window.setTimeout(() => {
      state.aborted = true;
      this.sendClipError(requestId, 'recorder_timeout');
      this.resetClipCapture(true);
    }, 15000);

    this.clipCaptureState = state;
    this.sendClipTelemetry('clip_started', requestId, {
      mimeType: state.mimeType,
      recorderMimeType: recorder.mimeType,
      timesliceMs: state.timesliceMs,
    });
  }

  private startFallbackClipCapture(requestId: string): void {
    try {
      const recorder = new FallbackClipRecorder(this.video);
      recorder.start();
      const state: FallbackRecorderClipState = {
        mode: 'fallback',
        id: requestId,
        recorder,
        startedAt: Date.now(),
        timeoutHandle: null,
        aborted: false,
      };

      state.timeoutHandle = window.setTimeout(() => {
        state.aborted = true;
        try {
          recorder.cancel();
        } catch (cancelError) {
          console.warn('Failed to cancel fallback recorder after timeout:', cancelError);
        }
        this.sendClipError(requestId, 'recorder_timeout');
        this.resetClipCapture(false);
      }, 15000);

      this.clipCaptureState = state;
      this.sendClipTelemetry('clip_started', requestId, {
        mode: 'fallback',
        mimeType: recorder.getMimeType(),
      });
    } catch (error) {
      this.sendClipError(requestId, 'fallback_recorder_failed', error);
    }
  }

  stopClipCapture(requestId: string): void {
    if (!this.clipCaptureState || this.clipCaptureState.id !== requestId) {
      this.sendClipError(requestId, 'unknown_capture_id');
      return;
    }

    if (this.clipCaptureState.mode === 'fallback') {
      if (this.clipCaptureState.timeoutHandle) {
        clearTimeout(this.clipCaptureState.timeoutHandle);
        this.clipCaptureState.timeoutHandle = null;
      }
      const state = this.clipCaptureState;
      state.recorder
        .stop()
        .then((clip) => this.handleFallbackClipStop(state, clip))
        .catch((error) => {
          this.sendClipError(requestId, 'fallback_recorder_failed', error);
          this.resetClipCapture(false);
        });
      this.sendClipTelemetry('clip_stop_requested', requestId, { mode: 'fallback' });
      return;
    }

    try {
      if (
        this.clipCaptureState.timesliceMs === null &&
        typeof this.clipCaptureState.recorder.requestData === 'function'
      ) {
        try {
          // Safari rejects MediaRecorder.start(timeslice). When we fall back to manual flushing,
          // explicitly request the last chunk before calling stop to avoid truncated clips.
          this.clipCaptureState.recorder.requestData();
        } catch (requestError) {
          console.warn('Failed to request final clip data before stop:', requestError);
        }
      }
      if (this.clipCaptureState.recorder.state !== 'inactive') {
        this.clipCaptureState.recorder.stop();
      }
      this.sendClipTelemetry('clip_stop_requested', requestId, undefined);
    } catch (error) {
      this.clipCaptureState.aborted = true;
      this.sendClipError(requestId, 'recorder_stop_failed', error);
      this.resetClipCapture(true);
    }
  }

  cancelClipCapture(): void {
    if (!this.clipCaptureState) {
      return;
    }
    this.clipCaptureState.aborted = true;
    try {
      if (this.clipCaptureState.mode === 'media_recorder') {
        if (this.clipCaptureState.recorder.state !== 'inactive') {
          this.clipCaptureState.recorder.stop();
        }
      } else {
        this.clipCaptureState.recorder.cancel();
      }
    } catch (error) {
      console.warn('Failed to cancel clip capture:', error);
    }
    this.resetClipCapture(true);
  }

  private resetClipCapture(stopRecorder: boolean): void {
    if (!this.clipCaptureState) {
      return;
    }

    const state = this.clipCaptureState;
    if (state.timeoutHandle) {
      clearTimeout(state.timeoutHandle);
      state.timeoutHandle = null;
    }

    if (state.mode === 'media_recorder') {
      if (state.requestDataInterval) {
        clearInterval(state.requestDataInterval);
        state.requestDataInterval = null;
      }

      if (stopRecorder) {
        try {
          if (state.recorder.state !== 'inactive') {
            state.recorder.stop();
          }
        } catch (error) {
          console.warn('Failed to stop recorder during reset:', error);
        }
      }

      try {
        state.recorder.ondataavailable = null as any;
        state.recorder.onerror = null as any;
        state.recorder.onstop = null as any;
        state.recorder.onstart = null as any;
      } catch (error) {
        console.warn('Failed to detach recorder listeners during reset:', error);
      }
    } else if (stopRecorder && !state.aborted) {
      try {
        state.recorder.cancel();
      } catch (error) {
        console.warn('Failed to cancel fallback recorder during reset:', error);
      }
    }

    this.clipCaptureState = null;
  }

  private handleClipStop(state: ClipCaptureState): void {
    if (state.mode !== 'media_recorder') {
      return;
    }

    if (state.timeoutHandle) {
      clearTimeout(state.timeoutHandle);
    }

    if (state.requestDataInterval) {
      clearInterval(state.requestDataInterval);
      state.requestDataInterval = null;
    }

    if (state.aborted) {
      return;
    }

    const effectiveMime = this.resolveClipMimeType(state);
    state.mimeType = effectiveMime;
    const blob = new Blob(state.chunks, { type: effectiveMime });
    if (blob.size === 0) {
      this.sendClipError(state.id, 'empty_clip_blob');
      this.resetClipCapture(false);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const result = reader.result as string | null;
        if (!result) {
          throw new Error('clip_read_failed');
        }
        const base64 = result.includes(',') ? result.split(',')[1] ?? '' : result;
        const durationMs = Math.max(0, Date.now() - state.startedAt);
        this.postClipReady({
          id: state.id,
          base64,
          mimeType: effectiveMime,
          durationMs,
          frameCount: state.frameCount,
          capturedAt: new Date(state.startedAt).toISOString(),
        });
      } catch (error) {
        this.sendClipError(state.id, 'clip_read_failed', error);
      } finally {
        this.resetClipCapture(false);
      }
    };

    reader.onerror = () => {
      this.sendClipError(state.id, 'clip_read_failed', reader.error);
      this.resetClipCapture(false);
    };

    try {
      reader.readAsDataURL(blob);
    } catch (error) {
      this.sendClipError(state.id, 'clip_read_failed', error);
      this.resetClipCapture(false);
    }
  }

  private handleFallbackClipStop(state: FallbackRecorderClipState, clip: FallbackClipResult): void {
    if (state.timeoutHandle) {
      clearTimeout(state.timeoutHandle);
      state.timeoutHandle = null;
    }

    if (state.aborted) {
      return;
    }

    try {
      if (!clip.base64) {
        throw new Error('fallback_clip_empty');
      }
      this.postClipReady({
        id: state.id,
        base64: clip.base64,
        mimeType: clip.mimeType,
        durationMs: clip.durationMs,
        frameCount: clip.frameCount,
        capturedAt: clip.capturedAt,
      });
    } catch (error) {
      this.sendClipError(state.id, 'fallback_recorder_failed', error);
    } finally {
      this.resetClipCapture(false);
    }
  }

  private postClipReady(payload: {
    id: string;
    base64: string;
    mimeType: string;
    durationMs: number;
    frameCount: number;
    capturedAt: string;
  }): void {
    try {
      window.ReactNativeWebView?.postMessage?.(JSON.stringify({ type: 'clip_ready', ...payload }));
      this.flushFrameBatch(true);
      this.sendClipTelemetry('clip_ready', payload.id, {
        durationMs: payload.durationMs,
        frameCount: payload.frameCount,
        mimeType: payload.mimeType,
      });
    } catch (error) {
      console.warn('Failed to post clip_ready message:', error);
      this.sendClipError(payload.id, 'clip_capture_failed', error);
    }
  }

  private sendClipError(requestId: string, reason: string, details?: unknown): void {
    try {
      const payload = {
        type: 'clip_error',
        id: requestId,
        reason,
        details: this.serializeError(details),
      };
      window.ReactNativeWebView?.postMessage?.(JSON.stringify(payload));
      this.sendClipTelemetry('clip_error', requestId, { reason, details: this.serializeError(details) });
    } catch (error) {
      console.warn('Failed to post clip_error message:', error);
    }
  }

  private sendClipTelemetry(event: string, requestId: string, data: Record<string, unknown> | undefined): void {
    void sendTelemetryEvent(event, { requestId, data, timestamp: Date.now() }).catch((error) => {
      console.warn('Failed to send clip telemetry:', error);
    });
  }

  private createMediaRecorder(
    stream: MediaStream,
  ): { recorder: MediaRecorder; mimeType?: string } | { errorReason: 'media_recorder_not_supported' | 'recorder_init_failed'; errorDetails?: unknown } {
    const candidates = this.getPreferredClipMimeTypes();
    const attemptSummaries: Array<{ candidate: string; error?: unknown }> = [];

    for (const candidate of candidates) {
      const attempt = this.tryCreateMediaRecorder(stream, candidate);
      if (attempt.ok) {
        return { recorder: attempt.recorder, mimeType: candidate };
      }

      attemptSummaries.push({ candidate, error: this.serializeError(attempt.error) });
      if (!attempt.recoverable) {
        return {
          errorReason: 'recorder_init_failed',
          errorDetails: { candidate, error: this.serializeError(attempt.error) },
        };
      }
    }

    const defaultAttempt = this.tryCreateMediaRecorder(stream, undefined);
    if (defaultAttempt.ok) {
      const mimeType = defaultAttempt.recorder.mimeType || undefined;
      return mimeType
        ? { recorder: defaultAttempt.recorder, mimeType }
        : { recorder: defaultAttempt.recorder };
    }

    attemptSummaries.push({ candidate: 'default', error: this.serializeError(defaultAttempt.error) });
    if (!defaultAttempt.recoverable) {
      return {
        errorReason: 'recorder_init_failed',
        errorDetails: { candidate: 'default', error: this.serializeError(defaultAttempt.error) },
      };
    }

    return {
      errorReason: 'media_recorder_not_supported',
      errorDetails: { attempts: attemptSummaries },
    };
  }

  private tryCreateMediaRecorder(
    stream: MediaStream,
    mimeType: string | undefined,
  ): { ok: true; recorder: MediaRecorder } | { ok: false; error: unknown; recoverable: boolean } {
    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      return { ok: true, recorder };
    } catch (error) {
      return { ok: false, error, recoverable: this.isCodecUnsupportedError(error) };
    }
  }

  private getPreferredClipMimeTypes(): string[] {
    const baseCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm',
    ];

    if (typeof window.MediaRecorder === 'undefined' || typeof window.MediaRecorder.isTypeSupported !== 'function') {
      return baseCandidates;
    }

    const baseOrder = new Map(baseCandidates.map((candidate, index) => [candidate, index]));
    const supportCache = new Map<string, boolean>();
    const isSupported = (candidate: string) => {
      if (!supportCache.has(candidate)) {
        try {
          supportCache.set(candidate, window.MediaRecorder!.isTypeSupported(candidate));
        } catch {
          supportCache.set(candidate, false);
        }
      }
      return supportCache.get(candidate) ?? false;
    };

    return baseCandidates.slice().sort((a, b) => {
      const aSupported = isSupported(a);
      const bSupported = isSupported(b);
      if (aSupported === bSupported) {
        return (baseOrder.get(a) ?? 0) - (baseOrder.get(b) ?? 0);
      }
      return aSupported ? -1 : 1;
    });
  }

  private isCodecUnsupportedError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const name = (error as { name?: unknown })?.name;
    if (name === 'NotSupportedError') {
      return true;
    }

    const rawMessage = (error as { message?: unknown })?.message ?? (typeof error === 'string' ? error : undefined);
    if (typeof rawMessage !== 'string') {
      return false;
    }

    const normalized = rawMessage.toLowerCase();
    return (
      normalized.includes('mime type') ||
      normalized.includes('codec') ||
      normalized.includes('not supported') ||
      normalized.includes('unsupported')
    );
  }

  private isTimesliceUnsupportedError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const name = (error as { name?: unknown })?.name;
    if (name === 'NotSupportedError') {
      return true;
    }

    const code = (error as { code?: unknown })?.code;
    if (code === 11) {
      // Safari <14 still exposes DOMException codes instead of names.
      return true;
    }

    const message = (error as { message?: unknown })?.message;
    if (typeof message === 'string') {
      const normalized = message.toLowerCase();
      if (normalized.includes('timeslice') || normalized.includes('duration') || normalized.includes('timeslice value')) {
        return true;
      }
    }

    return false;
  }

  private startRecorder(
    recorder: MediaRecorder,
  ): { ok: true; timesliceMs: number | null } | { ok: false; error: unknown } {
    const preferredTimeslice = 500;
    try {
      recorder.start(preferredTimeslice);
      return { ok: true, timesliceMs: preferredTimeslice };
    } catch (error) {
      if (!this.isTimesliceUnsupportedError(error)) {
        return { ok: false, error };
      }

      try {
        // Safari 17 and some Android System WebView builds throw when a timeslice parameter is provided.
        // Retry without it so recording still succeeds even if progress events are infrequent.
        recorder.start();
        return { ok: true, timesliceMs: null };
      } catch (fallbackError) {
        return { ok: false, error: fallbackError };
      }
    }
  }

  private resolveClipMimeType(state: ClipCaptureState): string {
    if (state.mode === 'fallback') {
      return state.recorder.getMimeType();
    }

    for (const chunk of state.chunks) {
      if (chunk instanceof Blob && typeof chunk.type === 'string' && chunk.type.length > 0) {
        return chunk.type;
      }
    }
    return state.mimeType || this.getPlatformDefaultMime();
  }

  private getPlatformDefaultMime(): string {
    const ua = typeof navigator !== 'undefined' && navigator?.userAgent ? navigator.userAgent : '';
    const uaData = typeof navigator !== 'undefined'
      ? (navigator as Navigator & {
          userAgentData?: {
            platform?: string;
            brands?: Array<{ brand: string }>;
          };
        }).userAgentData
      : undefined;
    const brandList = uaData?.brands ?? [];
    const isChromium = brandList.some((brand) => /Chrom(e|ium)|Edge/i.test(brand.brand));
    if (isChromium) {
      return 'video/webm';
    }
    const platform = uaData?.platform?.toLowerCase() ?? '';
    const isIOS = platform.length > 0
      ? /ios|iphone|ipad|ipod/.test(platform)
      : /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua);
    return isIOS || isSafari ? 'video/mp4' : 'video/webm';
  }

  private serializeError(details: unknown): unknown {
    if (!details) {
      return undefined;
    }
    if (details instanceof Error) {
      return { message: details.message, name: details.name };
    }
    if (typeof details === 'object') {
      try {
        return JSON.parse(JSON.stringify(details));
      } catch {
        return String(details);
      }
    }
    return details;
  }

  /**
   * Determine if expensive processing steps should be skipped
   */
  private shouldSkipExpensiveSteps(): boolean {
    const diagnostics = this.performanceOptimizer.getDiagnostics();
    const memoryStatus = this.memoryOptimizer.getMemoryStatus();
    const shouldSkip = diagnostics.averageProcessingTime > 50 || memoryStatus.pressureLevel > 1;
    gestureDebugLog('pipeline', 'Expensive step decision', () => ({
      shouldSkip,
      avgProcessingTime: diagnostics.averageProcessingTime,
      memoryPressure: memoryStatus.pressureLevel,
    }), { sampleIntervalMs: 2500 });
    return shouldSkip;
  }

  /**
   * Send gesture result to React Native
   */
  private sendLandmarks(landmarks: number[][][], handedness: string[], timestamp: number): void {
    const visibility = this.buildLandmarkVisibility(landmarks);
    const assessment = assessLandmarkConfidence(landmarks, visibility);
    if (!assessment.shouldStream) {
      gestureDebugLog('landmarks', 'Skipping low-confidence landmarks', () => assessment, { sampleIntervalMs: 1000 });
      return;
    }

    const payload: LandmarkStreamPayload = {
      type: 'landmarks',
      schemaVersion: LANDMARK_STREAM_SCHEMA_VERSION,
      landmarks,
      visibility,
      handednesses: handedness,
      handedness,
      timestamp,
    };
    messageBatcher.queueMessage(payload, {});
  }

  private buildLandmarkVisibility(landmarks: number[][][]): number[][] {
    if (!Array.isArray(landmarks)) {
      return [];
    }

    return landmarks.map((hand) => {
      if (!Array.isArray(hand)) {
        return [];
      }

      // HandLandmark entries do not include a visibility field, so we treat
      // a point as visible only when x/y/z coordinates are finite numbers.
      return hand.map((point) => {
        if (!Array.isArray(point) || point.length < 3) {
          return 0;
        }
        const [x, y, z] = point;
        return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? 1 : 0;
      });
    });
  }

  private sendGestureResult(
    processingResult: ProcessingResult,
    originalResults: MediaPipeGestureResult,
    normalizedResults?: NormalizedMediaPipeResult
  ): void {
    try {
      const handednessLabels =
        processingResult.metadata?.handednesses?.map((label) => String(label)) ??
        originalResults.handednesses?.map((hand) => {
          const category = hand?.[0]?.categoryName;
          return typeof category === 'string' ? category : 'unknown';
        }) ??
        [];

      const gestureLabel = processingResult.gesture ?? null;

      const payload: GestureMessagePayload = {
        type: 'gesture',
        gesture: gestureLabel,
        confidence: processingResult.confidence,
        landmarks: processingResult.landmarks,
        handednesses: handednessLabels,
        timestamp: processingResult.timestamp ?? Date.now(),
        isFallback: processingResult.isFallback ?? false,
        systemHealth: this.errorRecoveryManager.getHealthStatus(),
        processingTime: processingResult.processingTime,
        stepsExecuted: processingResult.stepsExecuted,
        skippedSteps: processingResult.skippedSteps,
        thresholds: {
          fallback: FALLBACK_CONFIDENCE_THRESHOLD,
          mlp: processingResult.metadata?.mlpDecision?.threshold ?? MLP_CONFIDENCE_THRESHOLD,
        },
        ...(processingResult.metadata?.method
          ? { detectionMethod: processingResult.metadata.method }
          : {}),
        ...(processingResult.metadata?.mlpDecision
          ? { mlpDecision: processingResult.metadata.mlpDecision }
          : {}),
        ...(processingResult.metadata?.mlp
          ? { mlp: processingResult.metadata.mlp }
          : {}),
      };

      const fallbackResult = processingResult.fallback;

      if (!payload.gesture && fallbackResult?.gesture) {
        payload.gesture = fallbackResult.gesture;
      }

      if ((payload.confidence ?? 0) === 0 && typeof fallbackResult?.confidence === 'number') {
        payload.confidence = fallbackResult.confidence;
      }

      if (!payload.isFallback && fallbackResult?.isFallback) {
        payload.isFallback = true;
      }

      const frameCapture = getLastCapturedFrame();
      const effectiveConfidence = payload.confidence ?? 0;
      if (frameCapture && (effectiveConfidence < FALLBACK_CONFIDENCE_THRESHOLD || payload.isFallback)) {
        payload.frameCapture = frameCapture;
      }

      const shouldFlushImmediately = Boolean(
        processingResult.isFallback ||
          fallbackResult?.isFallback ||
          processingResult.isUsingFallback
      );

      messageBatcher.queueMessage(payload, {
        flushImmediately: shouldFlushImmediately,
      });

      // Track gesture variation for learning
      if (gestureLabel && typeof gestureLabel === 'string') {
        this.trackGestureVariation(
          gestureLabel,
          processingResult.landmarks,
          normalizedResults?.poseLandmarks,
          normalizedResults?.faceLandmarks,
          handednessLabels,
          effectiveConfidence,
          effectiveConfidence >= FALLBACK_CONFIDENCE_THRESHOLD
        );
      }
    } catch (error) {
      console.warn('Failed to send gesture result:', error);
    }
  }

  private updateLandmarkInterval(): void {
    const diagnostics = this.performanceOptimizer.getDiagnostics();
    const average = Number.isFinite(diagnostics.averageProcessingTime)
      ? diagnostics.averageProcessingTime
      : 0;
    const adaptivePadding = diagnostics.adaptiveFrameSkipping ? ADAPTIVE_PADDING_MS : BASE_PADDING_MS;
    const computed = average > 0 ? average * PROCESSING_TIME_MULTIPLIER + adaptivePadding : DEFAULT_LANDMARK_INTERVAL_MS;
    const clamped = Math.max(MIN_LANDMARK_INTERVAL_MS, Math.min(MAX_LANDMARK_INTERVAL_MS, computed));
    this.landmarkSendIntervalMs = Math.round(clamped);
  }

  /**
   * Track gesture variation for adaptive learning
   * Amy First: Learn from her natural signing variations
   */
  private trackGestureVariation(
    gesture: string,
    handLandmarks: number[][][],
    poseLandmarks: number[][] | undefined,
    faceLandmarks: number[][] | undefined,
    handedness: string[],
    confidence: number,
    successfulMatch: boolean
  ): void {
    try {
      // Filter handedness to only include valid values (exclude 'unknown')
      const validHandedness = handedness.filter(
        (h): h is 'Left' | 'Right' | 'Both' => h === 'Left' || h === 'Right' || h === 'Both'
      );
      
      const landmarks: GestureLandmarks = {
        handLandmarks,
        handedness: validHandedness,
      };
      
      // Only add optional properties if they exist
      if (poseLandmarks) {
        landmarks.poseLandmarks = poseLandmarks;
      }
      if (faceLandmarks) {
        landmarks.faceLandmarks = faceLandmarks;
      }

      // Get current profile ID from window context if available
      const profileId = window.__currentProfileId || 'default';

      this.variationTracker.recordVariation(
        gesture,
        landmarks,
        confidence,
        successfulMatch,
        profileId
      );

      // Deterministic cleanup every N gestures instead of random
      this.variationCleanupCounter++;
      if (this.variationCleanupCounter >= this.VARIATION_CLEANUP_INTERVAL) {
        this.variationTracker.cleanup();
        this.variationCleanupCounter = 0;
      }
    } catch (error) {
      gestureDebugLog('variation', 'Failed to track gesture variation', () => ({ error }));
    }
  }

  /**
   * Get variation learning insights for a gesture
   * Useful for caregiver dashboard and practice recommendations
   */
  getVariationMetrics(gesture: string) {
    return this.variationTracker.getLearningMetrics(gesture);
  }

  /**
   * Export variation data for training
   */
  exportVariationsForTraining(gesture: string) {
    return this.variationTracker.exportForTraining(gesture);
  }

  /**
   * Get current system status
   */
  getStatus(): {
    initialized: boolean;
    running: boolean;
    performance: ReturnType<PerformanceOptimizer['getDiagnostics']>;
    memory: ReturnType<MemoryOptimizer['getMemoryStatus']>;
    health: ReturnType<ErrorRecoveryManager['getHealthStatus']>;
    detectorRuntime: GestureRuntimeDiagnostics | null;
  } {
    return {
      initialized: this.isInitialized,
      running: this.isRunning,
      performance: this.performanceOptimizer.getDiagnostics(),
      memory: this.memoryOptimizer.getMemoryStatus(),
      health: this.errorRecoveryManager.getHealthStatus(),
      detectorRuntime: this.gestureDetector?.getRuntimeDiagnostics() ?? null,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop(true);
    messageBatcher.forceFlush();
    setFrameCaptureEnabled(false);
    this.memoryOptimizer.performCleanup();
    this.resetLifecycleState(true);
  }

  private resetLifecycleState(shouldClearDetector = false): void {
    if (shouldClearDetector) {
      this.gestureDetector = null;
    }
    this.isInitialized = false;
    this.isRunning = false;
  }
}
