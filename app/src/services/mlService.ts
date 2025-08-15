import { TensorflowModel, loadTensorflowModel } from 'react-native-fast-tflite';
import { useCallback, useRef, useEffect } from 'react';
import type { Frame } from 'react-native-vision-camera';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';
import { logger } from '../utils/logger';
import { Worklets } from 'react-native-worklets-core';

let FileSystem: typeof import('expo-file-system') | null = null;
async function getFileSystem() {
  if (!FileSystem) {
    FileSystem = await import('expo-file-system');
  }
  return FileSystem;
}
import {
  useHandLandmarkExtractor,
  setHandLandmarkModel,
  extractHandLandmarksFlat as extractHandLandmarksWorklet,
  extractHandLandmarks,
  isResizePluginAvailable,
} from './landmarkExtractor';
import {
  classifyGesture,
  setGestureModel,
} from './gestureClassifier';
import {
  DetailedGestureResult,
  ProcessedFrame,
  MLServiceConfig,
  GestureResult,
  ClassificationOutput,
} from '../types/ml';
import { API_TOKEN, API_URL, CONFIDENCE_THRESHOLD } from '../constants';
import { database } from '../../db';
import { InteractionLog } from '../../db/models';
import { recordInteraction } from './adaptiveLearningService';
import { telemetry } from '../telemetry/recorder';
import { AdaptivePerformanceManager } from './AdaptivePerformanceManager';
import { logInteractionEvent } from './analytics';
import { ModelPerformanceMonitor } from './ModelPerformanceMonitor';
import { CircuitBreaker } from './CircuitBreaker';
import { OneEuroFilter } from './OneEuroFilter';
import { recommendedBufferSize } from './MemoryOptimizer';

class LandmarkSmoother {
  private filters: OneEuroFilter[][];
  private lastTimestamp: number;

  constructor() {
    this.filters = Array(21)
      .fill(0)
      .map(() => Array(3).fill(new OneEuroFilter()));
    this.lastTimestamp = -1;
  }

  smooth(landmarks: number[][]): number[][] {
    const now = Date.now();
    if (this.lastTimestamp === -1) {
      this.lastTimestamp = now;
    }
    const smoothed = landmarks.map((point, i) => {
      return point.map((p, j) => this.filters[i][j].filter(p, now));
    });
    this.lastTimestamp = now;
    return smoothed;
  }
}

class FrameBufferManager {
  private frameBuffer: (Frame | null)[] = [];
  private currentIndex = 0;
  constructor(private readonly maxBufferSize = 3) {
    this.frameBuffer = new Array(this.maxBufferSize).fill(null);
  }

  addFrame(frame: Frame): void {
    const oldFrame = this.frameBuffer[this.currentIndex];
    if (oldFrame) {
      (oldFrame as any)?.close?.();
    }
    this.frameBuffer[this.currentIndex] = frame;
    this.currentIndex = (this.currentIndex + 1) % this.maxBufferSize;
  }

  cleanup(): void {
    this.frameBuffer.forEach((f) => (f as any)?.close?.());
    this.frameBuffer = new Array(this.maxBufferSize).fill(null);
  }
}

const createRunOnJS = Worklets?.createRunOnJS ? Worklets.createRunOnJS : ((fn: any) => fn);

class ModelManager {
  private tfliteModel: TensorflowModel | null = null;
  private inferenceQueue: Array<{
    input: number[];
    resolve: (result: ClassificationOutput) => void;
  }> = [];
  private isInferring = false;

  setModel(model: TensorflowModel | null): void {
    this.tfliteModel = model;
  }

  async runInference(inputTensor: number[]): Promise<ClassificationOutput> {
    return new Promise((resolve) => {
      this.inferenceQueue.push({ input: inputTensor, resolve });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isInferring || this.inferenceQueue.length === 0) {
      return;
    }
    this.isInferring = true;
    const { input, resolve } = this.inferenceQueue.shift()!;
    try {
      if (!this.tfliteModel) {
        throw new Error('Model not loaded');
      }
      const logits = (this.tfliteModel.runSync([input as any]) as any[])[0] as number[];
      const len = logits.length;
      let maxLogit = -Infinity;
      for (let i = 0; i < len; i++) {
        if (logits[i] > maxLogit) maxLogit = logits[i];
      }
      let sum = 0;
      const probs = new Array<number>(len);
      for (let i = 0; i < len; i++) {
        const e = Math.exp(logits[i] - maxLogit);
        probs[i] = e;
        sum += e;
      }
      let maxProbability = 0;
      let maxIndex = -1;
      for (let i = 0; i < len; i++) {
        const p = probs[i] / sum;
        probs[i] = p;
        if (p > maxProbability) {
          maxProbability = p;
          maxIndex = i;
        }
      }
      resolve({ probabilities: probs, maxProbability, maxIndex });
    } catch (error) {
      logger.error('Inference failed:', error);
      resolve({ probabilities: [], maxProbability: 0, maxIndex: -1 });
    } finally {
      this.isInferring = false;
      if (this.inferenceQueue.length > 0) {
        this.processQueue();
      }
    }
  }

  dispose(): void {
    (this.tfliteModel as any)?.close?.();
    this.tfliteModel = null;
    this.inferenceQueue = [];
  }
}

class MachineLearningService {
  private landmarkModel: any = null;
  private gestureModel: TensorflowModel | null = null;
  private modelManager = new ModelManager();
  private isReady = false;
  // Thresholds: local vs cloud
  private localThreshold = 0.6;
  private cloudThreshold = 0.8;
  private baseConfidence = 0.6;
  private lowPowerConfidence = 0.7;
  private perfMonitor = new ModelPerformanceMonitor();
  private labels: string[] = [];
  private teachingSession: { id: string; label: string } | null = null;
  private collectedSamples: ProcessedFrame[] = [];
  private readonly processingCooldown = 1000;
  private remoteTimeout = 400; // ms
  private remoteRetryMs = 30_000;
  private readonly remoteFailureThreshold = 3;
  private _isCameraActive: boolean = true;
  private gestureBuffer: Array<{ label: string; confidence: number; timestamp: number }> = [];
  private smoothingWindow = 500; // ms
  private gestureDebounce = 2000; // ms
  private lastGestureTime = 0;
  private lastRecognizedGesture: string | null = null;
  private allowRemote = true;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker(
      this.remoteFailureThreshold,
      this.remoteRetryMs,
    );
  }

  get isCameraActive(): boolean {
    return this._isCameraActive;
  }

  setCameraActive(active: boolean): void {
    this._isCameraActive = active;
  }

  addCollectedSample(sample: ProcessedFrame) {
    this.collectedSamples.push(sample);
  }

  getAndClearCollectedSamples(): ProcessedFrame[] {
    const samples = [...this.collectedSamples];
    this.collectedSamples = [];
    return samples;
  }

  setLowPowerMode(low: boolean) {
    this.localThreshold = low ? this.lowPowerConfidence : this.baseConfidence;
  }

  getPerfMetrics() {
    return this.perfMonitor.metrics();
  }

  async loadModels(
    landmark: any,
    gesture: any,
    labels: string[],
    config?: MLServiceConfig,
  ): Promise<void> {
    try {
      // release any previously loaded models before loading new ones
      this.landmarkModel?.close?.();
      this.landmarkModel = null;
      this.modelManager.dispose();
      this.gestureModel = null;
      setHandLandmarkModel?.(null);
      setGestureModel(null);

      logger.info('Loading custom models...');

      if (typeof landmark === 'object' && landmark.url && loadTensorflowModel) {
        logger.info(`Loading landmark model from: ${landmark.url}`);
        try {
          this.landmarkModel = await loadTensorflowModel({ url: landmark.url });
          setHandLandmarkModel?.(this.landmarkModel);
        } catch (e) {
          logger.error('Failed to load landmark model:', e);
          throw e; // Re-throw to ensure isReady becomes false
        }
      } else {
        this.landmarkModel = landmark;
        setHandLandmarkModel?.(landmark);
      }

      if (typeof gesture === 'string' && loadTensorflowModel) {
        let modelPath = gesture;
        if (!gesture.startsWith('file://')) {
          const fs = await getFileSystem();
          const { uri } = await fs.downloadAsync(
            gesture,
            fs.documentDirectory + 'temp_model.tflite',
          );
          modelPath = uri;
          logger.info(`Downloaded model to: ${modelPath}`);
        }

        logger.info(`Loading model from: ${modelPath}`);
        try {
          this.gestureModel = await loadTensorflowModel({ url: modelPath });
      } catch (e) {
        logger.error('Failed to load gesture model:', e);
        throw e; // Re-throw to ensure isReady becomes false
      }
    } else if (typeof gesture === 'object' && gesture.url && loadTensorflowModel) {
      logger.info(`Loading gesture model from: ${gesture.url}`);
      try {
        this.gestureModel = await loadTensorflowModel({ url: gesture.url });
      } catch (e) {
        logger.error('Failed to load gesture model:', e);
        throw e; // Re-throw to ensure isReady becomes false
      }
    } else {
      this.gestureModel = gesture;
    }

      setGestureModel(this.gestureModel);
      this.modelManager.setModel(this.gestureModel);

      if (config?.confidenceThreshold) {
        this.localThreshold = config.confidenceThreshold;
      }
      if (config?.processingTimeout) {
        this.remoteTimeout = config.processingTimeout;
      }
      if (config?.enableRemoteClassification !== undefined) {
        this.allowRemote = config.enableRemoteClassification;
      }
      if (config?.remoteRetryMs !== undefined) {
        this.remoteRetryMs = config.remoteRetryMs;
        this.circuitBreaker = new CircuitBreaker(
          this.remoteFailureThreshold,
          this.remoteRetryMs,
        );
      }

      this.labels = labels;
      this.isReady = !!this.landmarkModel && !!this.gestureModel;

      logger.info('Custom models loaded successfully');
    } catch (error) {
      logger.error('Failed to load custom models:', error);
      this.isReady = false;
    }
  }

  unloadModels(): void {
    this.landmarkModel?.close?.();
    this.landmarkModel = null;
    this.modelManager.dispose();
    this.gestureModel = null;
    setHandLandmarkModel?.(null);
    setGestureModel(null);
    this.isReady = false;
  }

  isServiceReady = (): boolean => this.isReady;

  isCircuitBreakerOpen(): boolean {
    return this.circuitBreaker.isOpen();
  }

  private shouldUseRemote(): boolean {
    return this.allowRemote && !this.circuitBreaker.isOpen();
  }

  private handleRemoteFailure() {
    this.circuitBreaker.recordFailure();
  }

  async processFrameAsync(
    processed: ProcessedFrame,
    onResult: (result: { label: string; confidence: number; ts: number } | null) => void,
  ): Promise<void> {
    let result: DetailedGestureResult | null = null;
    let localConfidence = 0;

    if (processed.predictions) {
      try {
        const { gesture, confidence } = this.processModelOutput(processed.predictions);
        const suggestions = this.getTopPredictions(
          processed.predictions.probabilities,
          3,
        );

        result = {
          label: gesture,
          confidence,
          isLocal: true,
          timestamp: Date.now(),
          suggestions,
          requiresConfirmation: confidence < this.localThreshold,
        };
        localConfidence = confidence;
      } catch (error) {
        logger.error('Local gesture classification failed:', error);
        result = this.createUncertainResult('Local inference error');
      }
    }

    if ((localConfidence < this.localThreshold || !result) && this.shouldUseRemote()) {
      try {
        const remote = await Promise.race([
          this.classifyRemotely(processed),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Remote timeout')), this.remoteTimeout),
          ),
        ]);
        if (remote) {
          this.circuitBreaker.recordSuccess();
          result = remote;
        }
      } catch (error) {
        logger.debug('Remote classification failed, using local fallback');
        this.handleRemoteFailure();
        try {
          const predictions =
            processed.predictions ??
            (await this.modelManager.runInference(
              this.prepareTensorInput(processed),
            ));
          const { gesture, confidence } = this.processModelOutput(predictions);
          const suggestions = this.getTopPredictions(
            predictions.probabilities,
            3,
          );

          result = {
            label: gesture,
            confidence,
            isLocal: true,
            timestamp: Date.now(),
            suggestions,
            requiresConfirmation: confidence < this.localThreshold,
          };
        } catch (localError) {
          logger.error('Local gesture classification failed:', localError);
          result = this.createUncertainResult('Local inference error');
        }
      }
    }

    if (!result) {
      try {
        const predictions =
          processed.predictions ??
          (await this.modelManager.runInference(
            this.prepareTensorInput(processed),
          ));
        const { gesture, confidence } = this.processModelOutput(predictions);
        const suggestions = this.getTopPredictions(
          predictions.probabilities,
          3,
        );

        result = {
          label: gesture,
          confidence,
          isLocal: true,
          timestamp: Date.now(),
          suggestions,
          requiresConfirmation: confidence < this.localThreshold,
        };
      } catch (error) {
        logger.error('Local gesture classification failed:', error);
        result = this.createUncertainResult('Local inference error');
      }
    }

    if (result) {
      const smoothed = this.applyGestureSmoothing(result);
      if (!smoothed) {
        this.perfMonitor.recordDroppedFrame();
        onResult(null);
        return;
      }

      result = smoothed;
      const processingTime = Date.now() - processed.timestamp;
      telemetry.add(processingTime);
      this.perfMonitor.add({
        t: Date.now(),
        label: result.label,
        confidence: result.confidence,
        requiresConfirmation: result.requiresConfirmation,
        latencyMs: processingTime,
        inferenceType: result.isLocal ? 'local' : 'cloud',
      });
      if (this.perfMonitor.isDegraded()) {
        logger.warn('Model performance degraded', this.perfMonitor.metrics());
      }
      this.logInteraction({
        label: result.label,
        confidence: result.confidence,
        isLocal: result.isLocal,
        wasSuccessful: result.label !== 'uncertain',
        processingTimeMs: processingTime,
      });
      onResult({ label: result.label, confidence: result.confidence, ts: result.timestamp });
      return;
    }

    this.perfMonitor.recordDroppedFrame();
    onResult(null);
  }

  private async classifyRemotely(
    processedFrame: ProcessedFrame,
  ): Promise<DetailedGestureResult | null> {
    if (!API_URL || !API_TOKEN) {
      throw new Error('Remote API not configured');
    }

    const response = await fetch(`${API_URL}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({
        landmarks: processedFrame.landmarks,
        width: processedFrame.width,
        height: processedFrame.height,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      label: data.label,
      confidence: data.confidence,
      isLocal: false,
      timestamp: Date.now(),
      suggestions: data.suggestions || [],
      requiresConfirmation:
        data.requiresConfirmation || data.confidence < this.cloudThreshold,
    };
  }

  private prepareTensorInput(data: ProcessedFrame): number[] {
    return data.landmarks.flat();
  }

  private processModelOutput(output: ClassificationOutput): {
    gesture: string;
    confidence: number;
  } {
    const gesture = this.labels[output.maxIndex] || 'unknown';
    return { gesture, confidence: output.maxProbability };
  }

  private getTopPredictions(output: readonly number[], count = 3): string[] {
    return output
      .map((confidence, index) => ({ confidence, index }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, count)
      .map((item) => this.labels[item.index] || 'unknown');
  }

  createUncertainResult(reason: string): DetailedGestureResult {
    logger.debug(`Classification uncertain: ${reason}`);
    return {
      label: 'uncertain',
      confidence: 0,
      isLocal: true,
      timestamp: Date.now(),
      suggestions: [],
      requiresConfirmation: true,
    };
  }

  private applyGestureSmoothing(
    result: DetailedGestureResult,
  ): DetailedGestureResult | null {
    const now = Date.now();
    this.gestureBuffer.push({
      label: result.label,
      confidence: result.confidence,
      timestamp: now,
    });

    // keep only recent results
    this.gestureBuffer = this.gestureBuffer.filter(
      (r) => now - r.timestamp < this.smoothingWindow,
    );

    const recent = this.gestureBuffer.filter(
      (r) => r.confidence > this.localThreshold,
    );
    if (recent.length < 2) return null;

    const counts = new Map<string, number>();
    let maxConfidence = 0;
    for (const r of recent) {
      counts.set(r.label, (counts.get(r.label) || 0) + 1);
      if (r.confidence > maxConfidence) maxConfidence = r.confidence;
    }

    const mostCommon = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];

    if (
      mostCommon === this.lastRecognizedGesture &&
      now - this.lastGestureTime < this.gestureDebounce
    ) {
      return null;
    }

    this.lastRecognizedGesture = mostCommon;
    this.lastGestureTime = now;

    return { ...result, label: mostCommon, confidence: maxConfidence };
  }

  private async logInteraction(data: {
    label: string;
    confidence: number;
    isLocal: boolean;
    wasSuccessful: boolean;
    processingTimeMs: number;
  }) {
    try {
      await database.write(async () => {
        await database.get<InteractionLog>('interaction_logs').create((log) => {
          log.sessionId = 'current_session';
          log.gestureDefinitionId = data.label;
          log.wasSuccessful = data.wasSuccessful;
          log.confidenceScore = data.confidence;
          log.inputType = data.isLocal ? 'local_ml' : 'remote_ml';
          log.processingTimeMs = data.processingTimeMs;
          log.environmentalContext = 'unknown';
          log.createdAt = new Date();
        });
      });
      recordInteraction(data.label, data.wasSuccessful).catch(() => {});
      logInteractionEvent({
        gestureDefinitionId: data.label,
        wasSuccessful: data.wasSuccessful,
        confidenceScore: data.confidence,
        timestamp: Date.now(),
        processedBy: data.isLocal ? 'local' : 'cloud',
      }).catch(() => {});
    } catch (error) {
      logger.error('Failed to log interaction:', error);
    }
  }

  async startTeachingSession(gestureLabel: string): Promise<string> {
    const sessionId = `teach_${Date.now()}`;
    this.teachingSession = { id: sessionId, label: gestureLabel };
    logger.info(`Starting teaching session ${sessionId} for "${gestureLabel}"`);
    return sessionId;
  }

  async recordSample(sessionId: string, frame: Frame): Promise<void> {
    if (!this.teachingSession || this.teachingSession.id !== sessionId) return;

    const landmarks = extractHandLandmarks(frame);
    if (landmarks && landmarks.length > 0) {
      const processed: ProcessedFrame = {
        landmarks,
        width: frame.width,
        height: frame.height,
        timestamp: Date.now(),
        processingMs: 0,
        fps: 0,
      };
      this.addCollectedSample(processed);
      logger.info(`Recorded sample for session ${sessionId}`);
    }
  }
}

export const mlService = new MachineLearningService();

export const useGestureClassifier = (
  onResult: (
    result: GestureResult | null,
    landmarks: number[][],
    raw?: number[][],
    metrics?: { fps: number; processingMs: number; queueDepth: number; circuitBreakerOpen: boolean },
  ) => void,
  isProcessing: boolean,
  localThreshold: number,
  onError?: (message: string) => void,
) => {
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const externalProcessingRef = useRef(isProcessing);
  externalProcessingRef.current = isProcessing;

  const frameQueueRef = useRef<ProcessedFrame[]>([]);
  const internalProcessingRef = useRef(false);
  const maxQueueSize = 3;
  const serviceReady = useSharedValue(mlService.isServiceReady());
  const targetFps = useSharedValue(8);
  const lastFrameTime = useSharedValue(0);
  const smootherRef = useRef(new LandmarkSmoother());
  const frameBufferRef = useRef(new FrameBufferManager(recommendedBufferSize()));
  const perfManagerRef = useRef(new AdaptivePerformanceManager());
  const pluginAvailable = isResizePluginAvailable();
  const pluginError = useSharedValue(false);

  useEffect(() => {
    const readyInterval = setInterval(() => {
      serviceReady.value = mlService.isServiceReady();
    }, 500);
    return () => {
      clearInterval(readyInterval);
      frameBufferRef.current.cleanup();
    };
  }, [serviceReady]);

  useEffect(() => {
    const update = async () => {
      await perfManagerRef.current.apply(targetFps, (low) => mlService.setLowPowerMode(low));
    };
    update();
    const id = setInterval(update, 60000);
    return () => {
      clearInterval(id);
    };
  }, []);

  const processNextFrame = useCallback(() => {
    if (internalProcessingRef.current) {
      return;
    }
    const next = frameQueueRef.current.shift();
    if (!next) {
      return;
    }
    internalProcessingRef.current = true;
    mlService
      .processFrameAsync(next, (result) => {
        onResultRef.current(result, next.landmarks, next.landmarksRaw, {
          fps: next.fps,
          processingMs: next.processingMs,
          queueDepth: frameQueueRef.current.length,
          circuitBreakerOpen: mlService.isCircuitBreakerOpen(),
        });
      })
      .finally(() => {
        internalProcessingRef.current = false;
        if (frameQueueRef.current.length > 0) {
          processNextFrame();
        }
      });
  }, []);

  const enqueueFrame = useCallback(
    (processed: ProcessedFrame) => {
      if (frameQueueRef.current.length >= maxQueueSize) {
        frameQueueRef.current.shift();
      }
      const smoothed = smootherRef.current.smooth(processed.landmarks);
      frameQueueRef.current.push({
        ...processed,
        landmarks: smoothed,
        landmarksRaw: processed.landmarks,
      });
      processNextFrame();
    },
    [processNextFrame],
  );

  const addFrameJS = createRunOnJS((f: Frame) => frameBufferRef.current.addFrame(f));
  const enqueueFrameJS = createRunOnJS(enqueueFrame);
  const logErrorJS = createRunOnJS(logger.error);
  const onErrorJS = createRunOnJS((message: string) => onErrorRef.current?.(message));
  const extractWithPlugin = useHandLandmarkExtractor();
  const extractLandmarks =
    pluginAvailable ? extractWithPlugin : extractHandLandmarks;
  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      if (externalProcessingRef.current || !serviceReady.value) {
        return;
      }

      if (!pluginAvailable && !pluginError.value) {
        pluginError.value = true;
        onErrorJS('Frame processor plugin unavailable; using JS fallback');
      }

      const now = Date.now();
      const elapsed = now - lastFrameTime.value;
      const target = targetFps.value;
      if (target <= 0 || elapsed < 1000 / target) {
        return;
      }
      lastFrameTime.value = now;
      addFrameJS(frame);
      const start = Date.now();

      try {
        // Run dedicated worklet to extract and flatten landmarks
        let rawLandmarks: number[][] = [];
        // Only invoke the worklet extractor when the native plugin is available
        let flat = pluginAvailable ? extractHandLandmarksWorklet(frame) : null;
        // Guard against invalid worklet output (e.g. empty or unexpected length)
        if (!flat || flat.length % 3 !== 0) {
          rawLandmarks = extractLandmarks(frame) || [];
          if (rawLandmarks.length === 0) {
            if (!pluginError.value) {
              pluginError.value = true;
              onErrorJS('Landmark extraction failed');
            }
            return;
          }
          flat = new Float32Array(rawLandmarks.flat());
          if (!pluginError.value) {
            pluginError.value = true;
            onErrorJS('Using JS landmark extractor fallback');
          }
        } else {
          // Derive 2D landmarks from the flattened worklet output to avoid duplicate extraction
          const arr = flat as any; // Float32Array or number[]
          const count = Math.floor(arr.length / 3);
          rawLandmarks = new Array(count);
          for (let i = 0, k = 0; i < count; i++) {
            rawLandmarks[i] = [arr[k++], arr[k++], arr[k++]];
          }
        }
        const predictions = classifyGesture(flat, localThreshold);

        const end = Date.now();
        const processed: ProcessedFrame = {
          landmarks: rawLandmarks,
          width: frame.width,
          height: frame.height,
          timestamp: start,
          processingMs: end - start,
          fps: elapsed > 0 ? 1000 / elapsed : 0,
          predictions: predictions || undefined,
        };

        enqueueFrameJS(processed);
      } catch (error: any) {
        logErrorJS('WORKLET ERROR:', error);
        if (!pluginError.value) {
          pluginError.value = true;
          onErrorJS(error.message);
        }
      }
    },
    [
      serviceReady,
      targetFps,
      lastFrameTime,
      localThreshold,
      extractLandmarks,
      pluginAvailable,
      pluginError,
    ],
  );

  return frameProcessor;
};

export const useRecordingProcessor = (
  onLandmarks: (landmarks: number[][]) => void,
  isRecording: boolean,
  fps: number = 10,
) => {
  const onLandmarksRef = useRef(onLandmarks);
  onLandmarksRef.current = onLandmarks;

  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

  const lastProcessedTime = useSharedValue(0);
  const onLandmarksJS = createRunOnJS((lm: number[][]) => onLandmarksRef.current(lm));
  const logErrorJS = createRunOnJS(logger.error);
  const pluginAvailable = isResizePluginAvailable();
  const extractWithPluginRec = useHandLandmarkExtractor();
  const extractLandmarksRec =
    pluginAvailable ? extractWithPluginRec : extractHandLandmarks;
  const pluginError = useSharedValue(false);

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      if (!isRecordingRef.current) {
        return;
      }

      if (!pluginAvailable && !pluginError.value) {
        pluginError.value = true;
        logErrorJS('Frame processor plugin unavailable; using JS fallback');
      }

      const now = Date.now();
      if (now - lastProcessedTime.value < 1000 / fps) {
        return;
      }
      lastProcessedTime.value = now;

      try {
        const landmarks = extractLandmarksRec(frame);
        if (!landmarks || landmarks.length === 0) {
          return;
        }
        onLandmarksJS(landmarks);
      } catch (error: any) {
        logErrorJS('WORKLET ERROR:', error);
      }
    },
    [fps, extractLandmarksRec, pluginAvailable, pluginError],
  );

  return frameProcessor;
};
