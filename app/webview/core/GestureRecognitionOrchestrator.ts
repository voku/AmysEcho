/**
 * Main orchestrator for gesture recognition system
 * Coordinates all gesture detection components and manages the processing pipeline
 */

import { GestureDetector } from './GestureDetector';
import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import { MemoryOptimizer } from '../utils/MemoryOptimizer';
import {
  ProcessingPipeline,
  ProcessingStep,
  ProcessingContext,
  ProcessingResult,
} from '../utils/ProcessingPipeline';
import { OptimizedTremorCompensator } from '../utils/OptimizedTremorCompensator';
import { GestureSizeNormalizer } from '../gestureProcessing';
import { PartialGestureDetector } from '../gestureProcessing';
import { ErrorRecoveryManager } from '../utils/ErrorRecoveryManager';
import { FallbackGestureDetector } from '../core/FallbackGestureDetector';
import { EmergencyGestureSystem } from '../core/EmergencyGestureSystem';
import { HandStabilityAssistant } from '../core/HandStabilityAssistant';
import { BatteryMonitor } from '../core/BatteryMonitor';
import { loadConfig, GestureDetectorConfig } from '../config/GestureConfig';
import { MediaPipeGestureResult, TwoHandGesture } from '../types/MediaPipeTypes';
import { mapMediaPipeResult, NormalizedMediaPipeResult } from '../utils/mapMediaPipeResults';
import { messageBatcher, FRAME_LATENCY_SAMPLE_INTERVAL } from '../utils/MessageBatcher';
import { captureFrameForOpenAI, getLastCapturedFrame, setFrameCaptureEnabled } from '../utils/FrameCaptureManager';

const FALLBACK_CONFIDENCE_THRESHOLD =
  typeof window.__fallbackThreshold === 'number' ? window.__fallbackThreshold : 0.35;
const MLP_CONFIDENCE_THRESHOLD =
  typeof window.__mlpThreshold === 'number' ? window.__mlpThreshold : 0.05;

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
  frameCapture?: string | null;
}

const FRAME_BATCH_INTERVAL_MS = 400;
const FRAME_BUFFER_LIMIT = 24;

interface FrameBatchEntry {
  frame: string;
  landmarks: number[][][];
  handednesses: string[];
  timestamp: number;
}

interface ClipCaptureState {
  id: string;
  recorder: MediaRecorder;
  chunks: BlobPart[];
  startedAt: number;
  mimeType: string;
  frameCount: number;
  timeoutHandle?: number | null;
}

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
  private emergencySystem!: EmergencyGestureSystem;
  private handStabilityAssistant!: HandStabilityAssistant;
  private batteryMonitor!: BatteryMonitor;
  private config: GestureDetectorConfig;

  private isInitialized = false;
  private isRunning = false;
  private frameSampleCounter = 0;
  private lastLandmarkSendTime = 0;
  private frameBuffer: FrameBatchEntry[] = [];
  private frameBatchTimer: number | null = null;
  private clipCaptureState: ClipCaptureState | null = null;

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
    this.emergencySystem = new EmergencyGestureSystem();
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
    this.processingPipeline.addStep(new GestureDetectionStep(this.config));
    this.processingPipeline.addStep(new PartialGestureAnalysisStep(this.partialDetector));
    this.processingPipeline.addStep(new EmergencyGestureCheckStep(this.emergencySystem));
    this.processingPipeline.addStep(new FallbackProcessingStep(this.fallbackDetector, this.errorRecoveryManager));
    this.processingPipeline.addStep(new ResultProcessingStep(this.errorRecoveryManager));

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
      setFrameCaptureEnabled(true);

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
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.cancelClipCapture();
    this.flushFrameBatch(true);
    this.frameBuffer = [];

    await this.gestureDetector?.stop();
    this.isRunning = false;
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

      const context: ProcessingContext = {
        landmarks: normalized.landmarks,
        timestamp,
        processingStep: 'gesture_results',
        skipExpensiveSteps: this.shouldSkipExpensiveSteps(),
        rawResults: results,
        rawLandmarks: normalized.landmarks,
        handednesses: normalized.handednesses,
        normalizedResults: normalized
      };

      // Execute processing pipeline
      const processingResult = await this.processingPipeline.executePipeline(context);

      // Send landmarks for preview and recognition at throttled rate
      const hasLandmarks = normalized.landmarks.some(hand => hand.length > 0);
      const now = Date.now();
      if (hasLandmarks && (now - this.lastLandmarkSendTime) > 500) { // Throttle to prevent app lag
        this.sendLandmarks(normalized.landmarks, normalized.handednesses, timestamp);
        this.lastLandmarkSendTime = now;
      }

      // Send gesture results if detected
      const hasGestureResult =
        Boolean(processingResult.gesture) ||
        (processingResult.confidence ?? 0) > 0.3 || // Lower threshold for fallback gestures
        Boolean(processingResult.fallback?.gesture);

      console.log('Gesture result check:', JSON.stringify({
        hasGestureResult,
        gesture: processingResult.gesture,
        confidence: processingResult.confidence,
        hasFallback: Boolean(processingResult.fallback?.gesture)
      }));

      if (hasGestureResult) {
        console.log('Sending gesture result:', JSON.stringify(processingResult));
        this.sendGestureResult(processingResult, results);
      } else if (hasLandmarks) {
        // Send landmark data so the app can log uncertain frames and build training datasets
        this.sendGestureResult({
          gesture: null,
          confidence: 0,
          landmarks: normalized.landmarks,
          metadata: {
            method: 'none',
            perHand: [],
            handednesses: normalized.handednesses,
            mlp: null,
            twoHand: null
          },
          timestamp,
          isFallback: false,
          systemHealth: this.errorRecoveryManager.getHealthStatus(),
          processingTime: processingResult.processingTime,
          stepsExecuted: processingResult.stepsExecuted,
          skippedSteps: processingResult.skippedSteps,
        }, results);
      }

      // Update performance metrics
      this.performanceOptimizer.recordProcessingTime(processingResult.processingTime);

      this.frameSampleCounter += 1;
      if (this.frameSampleCounter >= FRAME_LATENCY_SAMPLE_INTERVAL) {
        const metrics = this.performanceOptimizer.getPerformanceMetrics();
        if (metrics.averageProcessingTime > 30) {
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
      const frameDataUrl = captureFrameForOpenAI(this.video);
      if (!frameDataUrl) {
        return;
      }

      const entry: FrameBatchEntry = {
        frame: frameDataUrl,
        landmarks: normalized.landmarks,
        handednesses: normalized.handednesses,
        timestamp: Date.now(),
      };

      this.frameBuffer.push(entry);
      if (this.frameBuffer.length > FRAME_BUFFER_LIMIT) {
        this.frameBuffer = this.frameBuffer.slice(-FRAME_BUFFER_LIMIT);
      }

      if (this.clipCaptureState) {
        this.clipCaptureState.frameCount += 1;
      }

      if (this.frameBatchTimer === null) {
        this.frameBatchTimer = window.setTimeout(() => this.flushFrameBatch(), FRAME_BATCH_INTERVAL_MS);
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

    if (typeof window.MediaRecorder === 'undefined') {
      this.sendClipError(requestId, 'media_recorder_unavailable');
      return;
    }

    const stream = this.gestureDetector?.getCameraStream();
    if (!stream) {
      this.sendClipError(requestId, 'no_camera_stream');
      return;
    }

    const recorderResult = this.createMediaRecorder(stream);
    if ('errorReason' in recorderResult) {
      this.sendClipError(requestId, recorderResult.errorReason, recorderResult.errorDetails);
      return;
    }

    const { recorder, mimeType } = recorderResult;

    const state: ClipCaptureState = {
      id: requestId,
      recorder,
      chunks: [],
      startedAt: Date.now(),
      mimeType: recorder.mimeType || mimeType || 'video/webm',
      frameCount: 0,
      timeoutHandle: null,
    };

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        state.chunks.push(event.data);
      }
    };

    recorder.onerror = (event: Event) => {
      const error = (event as { error?: unknown }).error;
      this.sendClipError(requestId, 'recorder_error', error);
      this.resetClipCapture(true);
    };

    recorder.onstop = () => {
      this.handleClipStop(state);
    };

    try {
      recorder.start(500);
    } catch (error) {
      this.sendClipError(requestId, 'recorder_start_failed', error);
      this.resetClipCapture(true);
      return;
    }

    state.timeoutHandle = window.setTimeout(() => {
      this.sendClipError(requestId, 'recorder_timeout');
      this.resetClipCapture(true);
    }, 15000);

    this.clipCaptureState = state;
    this.sendClipTelemetry('clip_started', requestId, {
      mimeType: state.mimeType,
      recorderMimeType: recorder.mimeType,
    });
  }

  stopClipCapture(requestId: string): void {
    if (!this.clipCaptureState || this.clipCaptureState.id !== requestId) {
      this.sendClipError(requestId, 'unknown_capture_id');
      return;
    }

    try {
      if (this.clipCaptureState.recorder.state !== 'inactive') {
        this.clipCaptureState.recorder.stop();
      }
      this.sendClipTelemetry('clip_stop_requested', requestId, undefined);
    } catch (error) {
      this.sendClipError(requestId, 'recorder_stop_failed', error);
      this.resetClipCapture(true);
    }
  }

  cancelClipCapture(): void {
    if (!this.clipCaptureState) {
      return;
    }
    try {
      if (this.clipCaptureState.recorder.state !== 'inactive') {
        this.clipCaptureState.recorder.stop();
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

    this.clipCaptureState = null;
  }

  private handleClipStop(state: ClipCaptureState): void {
    if (state.timeoutHandle) {
      clearTimeout(state.timeoutHandle);
    }

    const blob = new Blob(state.chunks, { type: state.mimeType || 'video/webm' });
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
          mimeType: state.mimeType || 'video/webm',
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
    try {
      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: 'telemetry',
          event,
          requestId,
          data,
          timestamp: Date.now(),
        }),
      );
    } catch (error) {
      console.warn('Failed to send clip telemetry:', error);
    }
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
      return { recorder: defaultAttempt.recorder, mimeType: defaultAttempt.recorder.mimeType || undefined };
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
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/webm;codecs=vp9',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
    ];

    if (typeof window.MediaRecorder === 'undefined' || typeof window.MediaRecorder.isTypeSupported !== 'function') {
      return baseCandidates;
    }

    const supported: string[] = [];
    const unsupported: string[] = [];

    for (const candidate of baseCandidates) {
      if (window.MediaRecorder!.isTypeSupported(candidate)) {
        supported.push(candidate);
      } else {
        unsupported.push(candidate);
      }
    }

    return [...supported, ...unsupported];
  }

  private isCodecUnsupportedError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const name = (error as { name?: string }).name;
    if (name === 'NotSupportedError') {
      return true;
    }

    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const normalized = message.toLowerCase();
      if (
        normalized.includes('not supported') ||
        normalized.includes('mime') ||
        normalized.includes('codec')
      ) {
        return true;
      }
    }

    return false;
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
    const metrics = this.performanceOptimizer.getPerformanceMetrics();
    const memoryStatus = this.memoryOptimizer.getMemoryStatus();
    const shouldSkip = metrics.averageProcessingTime > 50 || memoryStatus.pressureLevel > 1;
    console.log('shouldSkipExpensiveSteps:', shouldSkip, 'avgTime:', metrics.averageProcessingTime, 'memoryPressure:', memoryStatus.pressureLevel);
    return shouldSkip;
  }

  /**
   * Send gesture result to React Native
   */
  private sendLandmarks(landmarks: number[][][], handedness: string[], timestamp: number): void {
    const payload = {
      type: 'landmarks',
      landmarks,
      handedness,
      timestamp,
    };
    messageBatcher.queueMessage(payload, {});
  }

  private sendGestureResult(processingResult: ProcessingResult, originalResults: MediaPipeGestureResult): void {
    try {
      const handednessLabels =
        processingResult.metadata?.handednesses?.map((label) => String(label)) ??
        originalResults.handednesses?.map((hand) => {
          const category = hand?.[0]?.categoryName;
          return typeof category === 'string' ? category : 'unknown';
        }) ??
        [];

      const gestureLabel = processingResult.gesture ?? undefined;

      const payload: GestureMessagePayload = {
        type: 'gesture',
        gesture: gestureLabel,
        confidence: processingResult.confidence,
        landmarks: processingResult.landmarks,
        handednesses: handednessLabels,
        timestamp: processingResult.timestamp ?? Date.now(),
        isFallback: processingResult.isFallback,
        systemHealth: this.errorRecoveryManager.getHealthStatus(),
        processingTime: processingResult.processingTime,
        stepsExecuted: processingResult.stepsExecuted,
        skippedSteps: processingResult.skippedSteps,
        thresholds: {
          fallback: FALLBACK_CONFIDENCE_THRESHOLD,
          mlp: MLP_CONFIDENCE_THRESHOLD,
        },
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
        processingResult.emergency?.detected ||
          processingResult.isFallback ||
          fallbackResult?.isFallback ||
          processingResult.isUsingFallback
      );

      messageBatcher.queueMessage(payload, {
        flushImmediately: shouldFlushImmediately,
      });
    } catch (error) {
      console.warn('Failed to send gesture result:', error);
    }
  }

  /**
   * Get current system status
   */
  getStatus(): {
    initialized: boolean;
    running: boolean;
    performance: any;
    memory: any;
    health: any;
  } {
    return {
      initialized: this.isInitialized,
      running: this.isRunning,
      performance: this.performanceOptimizer.getPerformanceMetrics(),
      memory: this.memoryOptimizer.getMemoryStatus(),
      health: this.errorRecoveryManager.getHealthStatus()
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop();
    messageBatcher.forceFlush();
    setFrameCaptureEnabled(false);
    this.memoryOptimizer.performCleanup();
  }
}

/**
 * Processing step for landmark preprocessing
 */
class LandmarkPreprocessingStep implements ProcessingStep {
  name = 'landmark_preprocessing';
  isExpensive = false;

  constructor(
    private sizeNormalizer: GestureSizeNormalizer,
    private tremorCompensator: OptimizedTremorCompensator
  ) {}

  async execute(context: ProcessingContext): Promise<any> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return { landmarks: context.landmarks };
    }

    // Apply size normalization
    let processedLandmarks = this.sizeNormalizer.normalizeHandSize(context.landmarks);

    // Apply tremor compensation
    processedLandmarks = this.tremorCompensator.smoothLandmarks(processedLandmarks);

    return {
      landmarks: processedLandmarks,
      rawLandmarks: context.landmarks,
      preprocessing: {
        sizeNormalized: true,
        tremorCompensated: true
      }
    };
  }
}

/**
 * Processing step for stability analysis
 */
class StabilityAnalysisStep implements ProcessingStep {
  name = 'stability_analysis';
  isExpensive = false;

  constructor(private stabilityAssistant: HandStabilityAssistant) {}

  async execute(context: ProcessingContext): Promise<any> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return { stability: { isStable: false, score: 0 } };
    }

    const stability = this.stabilityAssistant.analyzeStability(context.landmarks);

    return {
      stability,
      feedback: stability.feedback
    };
  }
}

/**
 * Processing step for main gesture detection
 */
export class GestureDetectionStep implements ProcessingStep {
  name = 'gesture_detection';
  isExpensive = true; // MediaPipe processing can be expensive

  constructor(private config: GestureDetectorConfig) {}

  async execute(context: ProcessingContext): Promise<any> {
    console.log('GestureDetectionStep executing, skipExpensive:', context.skipExpensiveSteps);
    const rawResults = context.rawResults;
    const normalized = context.normalizedResults ?? mapMediaPipeResult(rawResults);
    const handednesses = normalized.handednesses;
    const rawHandednesses = rawResults?.handednesses ?? [];

    const perHand = this.extractPerHandDetections(normalized);
    console.log('Per hand detections:', perHand);

    let selectedGesture: string | null = null;
    let selectedConfidence = 0;
    let detectionMethod: 'mediapipe' | 'mlp' | 'none' = 'none';
    let twoHandMetadata: TwoHandGesture | null = null;

    // Determine best MediaPipe gesture candidate
    if (perHand.length > 0) {
      for (const candidate of perHand) {
        if (candidate.score > selectedConfidence) {
          selectedGesture = this.normalizeLabel(candidate.label);
          selectedConfidence = candidate.score;
          detectionMethod = 'mediapipe';
        }
      }

      // Attempt to form a two-hand gesture when both hands detected
      if (perHand.length >= 2) {
        const twoHandCandidate = this.resolveTwoHandGesture(perHand);
        if (twoHandCandidate) {
          selectedGesture = this.formatTwoHandGesture(twoHandCandidate.gesture);
          selectedConfidence = twoHandCandidate.score;
          detectionMethod = 'mediapipe';
          twoHandMetadata = twoHandCandidate.gesture;
        }
      }
    }

    // Invoke custom MLP if available and better than MediaPipe result
    let mlpMetadata: { label: string; score: number } | null = null;
    console.log('Checking MLP availability:', typeof window.__mlpPredict);
    if (typeof window.__mlpPredict === 'function') {
      console.log('MLP function available, attempting prediction');
      try {
        // The embedded MLP expects MediaPipe's handedness structure to decide which
        // hand should be mirrored, so prefer the raw array when available. Fall
        // back to the normalized labels only if MediaPipe omitted handedness
        // information entirely.
        console.log('MLP input landmarks:', context.landmarks);
        console.log('MLP input handednesses:', rawHandednesses.length > 0 ? rawHandednesses : handednesses);
        const mlpResult = window.__mlpPredict(
          context.rawLandmarks ?? context.landmarks ?? [],
          rawHandednesses.length > 0 ? rawHandednesses : handednesses
        );
        console.log('MLP prediction result:', JSON.stringify(mlpResult)); // Debug logging
        if (mlpResult && typeof mlpResult.score === 'number') {
          mlpMetadata = mlpResult;
          const threshold = this.config?.thresholds?.mlpConfidence ?? MLP_CONFIDENCE_THRESHOLD;
          console.log('MLP threshold check:', JSON.stringify({ score: mlpResult.score, threshold, selectedConfidence })); // Debug logging
          // Calculate confidence margin - require higher confidence to override mediapipe
          const isMediaPipeConfident = selectedConfidence > 0.3;
          const confidenceMargin = isMediaPipeConfident ? 0.15 : 0;

          if (mlpResult.score >= threshold && 
              (selectedGesture === null || 
               selectedGesture === 'none' || 
               mlpResult.score >= (selectedConfidence + confidenceMargin))) {
            console.log('MLP gesture selected:', JSON.stringify({ 
              label: mlpResult.label, 
              score: mlpResult.score,
              margin: confidenceMargin
            })); // Debug logging
            selectedGesture = this.normalizeLabel(mlpResult.label);
            selectedConfidence = mlpResult.score;
            detectionMethod = 'mlp';
            twoHandMetadata = null;
          } else {
            console.log('MLP gesture not selected:', JSON.stringify({ 
              score: mlpResult.score, 
              threshold, 
              selectedConfidence,
              margin: confidenceMargin 
            })); // Debug logging
          }
        } else {
          console.log('MLP result invalid:', JSON.stringify({ mlpResult, hasScore: typeof mlpResult?.score === 'number' })); // Debug logging
        }
      } catch (error) {
        console.warn('MLP prediction failed:', error);
        const predictionPrefix = typeof window.__predictionError === 'string' && window.__predictionError.length > 0
          ? window.__predictionError
          : 'MLP prediction failed: ';
        try {
          window.ReactNativeWebView?.postMessage?.(
            JSON.stringify({
              type: 'error',
              message: `${predictionPrefix}${error instanceof Error ? error.message : String(error)}`,
              _technical: {
                stack: error instanceof Error ? error.stack ?? null : null,
              }
            })
          );
        } catch (postMessageError) {
          console.debug('Failed to post MLP prediction error to React Native:', postMessageError);
        }
      }
    }

    return {
      gesture: selectedGesture,
      confidence: selectedConfidence,
      landmarks: context.landmarks,
      metadata: {
        method: detectionMethod,
        perHand: perHand.map(({ hand, label, score }) => ({ hand, label, score })),
        handednesses,
        mlp: mlpMetadata,
        twoHand: twoHandMetadata
      }
    };
  }

  private extractPerHandDetections(
    normalized: NormalizedMediaPipeResult
  ): Array<{ index: number; hand: string; label: string; score: number }> {
    const detections: Array<{ index: number; hand: string; label: string; score: number }> = [];

    normalized.hands.forEach((hand, index) => {
      const topGesture = hand.gestures[0];
      if (!topGesture) {
        return;
      }

      const normalizedLabel = this.normalizeLabel(topGesture.label);
      if (!normalizedLabel) {
        return;
      }

      detections.push({
        index,
        hand: hand.handedness ?? 'unknown',
        label: normalizedLabel,
        score: topGesture.score
      });
    });

    return detections;
  }

  private resolveTwoHandGesture(
    perHand: Array<{ index: number; hand: string; label: string; score: number }>
  ): { gesture: TwoHandGesture; score: number } | null {
    if (perHand.length < 2) {
      return null;
    }

    const leftCandidate = this.findCandidate(perHand, /left/i);
    const rightCandidate = this.findCandidate(perHand, /right/i, leftCandidate?.index);

    const finalLeft = leftCandidate ?? null;
    const finalRight = rightCandidate ?? null;

    if (!finalLeft || !finalRight) {
      return null;
    }

    return {
      gesture: {
        left: finalLeft.label,
        right: finalRight.label
      },
      score: Math.sqrt(finalLeft.score * finalRight.score)
    };
  }

  private findCandidate(
    perHand: Array<{ index: number; hand: string; label: string; score: number }>,
    pattern: RegExp,
    excludeIndex?: number
  ): { index: number; hand: string; label: string; score: number } | undefined {
    return perHand.find(candidate => {
      if (excludeIndex !== undefined && candidate.index === excludeIndex) {
        return false;
      }
      return pattern.test(candidate.hand);
    });
  }

  private formatTwoHandGesture(gesture: TwoHandGesture): string {
    return `${gesture.left}+${gesture.right}`;
  }

  private normalizeLabel(label?: string | null): string | null {
    if (!label) {
      return null;
    }
    const normalized = label.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
}

/**
 * Processing step for partial gesture analysis
 */
class PartialGestureAnalysisStep implements ProcessingStep {
  name = 'partial_gesture_analysis';
  isExpensive = false;

  constructor(private partialDetector: PartialGestureDetector) {}

  async execute(context: ProcessingContext): Promise<any> {
    if (!context.landmarks || context.landmarks.length === 0) {
      return { partial: null };
    }

    // Analyze common gestures for partial completion
    const commonGestures = ['thumbs_up', 'open_palm', 'fist', 'point'];
    let bestPartial: any = null;

    for (const gesture of commonGestures) {
      const partial = this.partialDetector.analyzePartialCompletion(context.landmarks, gesture);
      if (partial.isPartial && (!bestPartial || partial.completion > bestPartial.completion)) {
        bestPartial = { ...partial, gesture };
      }
    }

    return { partial: bestPartial };
  }
}

/**
 * Processing step for emergency gesture checking
 */
class EmergencyGestureCheckStep implements ProcessingStep {
  name = 'emergency_gesture_check';
  isExpensive = false;

  constructor(private emergencySystem: EmergencyGestureSystem) {}

  async execute(context: ProcessingContext): Promise<any> {
    const normalized = context.normalizedResults ?? mapMediaPipeResult(context.rawResults);
    const emergencyStatus = {
      detected: false,
      priority: 'normal' as 'normal' | 'high' | 'critical',
      feedback: '',
      cooldownRemaining: 0,
    };

    for (const hand of normalized.hands) {
      const candidate = hand.gestures?.[0];
      if (!candidate || !candidate.label) {
        continue;
      }

      if (!this.emergencySystem.isEmergencyGesture(candidate.label, candidate.score ?? 0)) {
        continue;
      }

      const processed = this.emergencySystem.processEmergencyGesture(
        candidate.label,
        candidate.score ?? 0,
        context.landmarks
      );

      emergencyStatus.priority = processed.priority;
      emergencyStatus.cooldownRemaining = processed.cooldownRemaining;
      emergencyStatus.feedback = processed.feedback;

      if (processed.shouldProcess) {
        emergencyStatus.detected = true;
        break;
      }
    }

    return { emergency: emergencyStatus };
  }
}

/**
 * Processing step for fallback gesture detection
 */
class FallbackProcessingStep implements ProcessingStep {
  name = 'fallback_processing';
  isExpensive = false;

  constructor(
    private fallbackDetector: FallbackGestureDetector,
    private errorRecoveryManager: ErrorRecoveryManager
  ) {}

  async execute(context: ProcessingContext): Promise<any> {
    if (!this.errorRecoveryManager.isInFallbackMode()) {
      return { fallback: null };
    }

    if (!context.landmarks || context.landmarks.length === 0) {
      return { fallback: null };
    }

    const fallback = this.fallbackDetector.detectGesture(context.landmarks);

    return {
      fallback,
      isUsingFallback: true
    };
  }
}

/**
 * Processing step for final result processing
 */
class ResultProcessingStep implements ProcessingStep {
  name = 'result_processing';
  isExpensive = false;

  constructor(private errorRecoveryManager: ErrorRecoveryManager) {}

  async execute(context: ProcessingContext): Promise<any> {
    // Final result processing and validation
    return {
      finalResult: {
        validated: true,
        timestamp: context.timestamp
      }
    };
  }
}
