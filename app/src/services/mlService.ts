import { TensorflowModel, loadTensorflowModel } from 'react-native-fast-tflite';
import { useCallback, useRef } from 'react';
import type { Frame } from 'react-native-vision-camera';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';

let FileSystem: typeof import('expo-file-system') | null = null;

let runOnJS: any = (fn: Function) => fn;

async function getFileSystem() {
  if (!FileSystem) {
    FileSystem = await import('expo-file-system');
  }
  return FileSystem;
}
try {
  const worklets = require('react-native-worklets-core');
  runOnJS = worklets.runOnJS;
} catch (e) {
  console.warn('Worklets not available, using fallback:', e);
}

import { logger } from '../utils/logger';
import { extractHandLandmarks, setHandLandmarkModel } from './landmarkExtractor';
import { DetailedGestureResult, ProcessedFrame, MLServiceConfig } from '../types/ml';
import { API_TOKEN, API_URL, CONFIDENCE_THRESHOLD } from '../constants';
import { database } from '../../db';
import { InteractionLog } from '../../db/models';
import { recordInteraction } from './adaptiveLearningService';

class MachineLearningService {
  private landmarkModel: any = null;
  private gestureModel: any = null;
  private isReady = false;
  private confidenceThreshold = 0.7;
  private labels: string[] = [];
  private teachingSession: { id: string; label: string } | null = null;
  private collectedSamples: ProcessedFrame[] = [];
  private readonly processingCooldown = 1000;
  private remoteTimeout = 400; // ms
  private _isCameraActive: boolean = true;
  private gestureBuffer: Array<{ label: string; confidence: number; timestamp: number }> = [];
  private smoothingWindow = 500; // ms
  private gestureDebounce = 2000; // ms
  private lastGestureTime = 0;
  private lastRecognizedGesture: string | null = null;
  private allowRemote = true;
  private remoteAvailable = true;
  private remoteRetryAt = 0;
  private remoteRetryMs = 30000; // ms

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
      this.gestureModel?.close?.();
      this.gestureModel = null;
      setHandLandmarkModel?.(null);

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

      if (config?.confidenceThreshold) {
        this.confidenceThreshold = config.confidenceThreshold;
      }
      if (config?.processingTimeout) {
        this.remoteTimeout = config.processingTimeout;
      }
      if (config?.enableRemoteClassification !== undefined) {
        this.allowRemote = config.enableRemoteClassification;
      }
      if (config?.remoteRetryMs !== undefined) {
        this.remoteRetryMs = config.remoteRetryMs;
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
    this.gestureModel?.close?.();
    this.gestureModel = null;
    setHandLandmarkModel?.(null);
    this.isReady = false;
  }

  isServiceReady = (): boolean => this.isReady;

  private shouldUseRemote(): boolean {
    if (!this.allowRemote) {
      return false;
    }
    if (!this.remoteAvailable && Date.now() >= this.remoteRetryAt) {
      this.remoteAvailable = true;
    }
    return this.remoteAvailable;
  }

  private handleRemoteFailure() {
    this.remoteAvailable = false;
    this.remoteRetryAt = Date.now() + this.remoteRetryMs;
  }

  async processFrameAsync(
    processed: ProcessedFrame,
    onResult: (result: DetailedGestureResult | null) => void,
  ): Promise<void> {
    let result: DetailedGestureResult | null = null;

    if (this.shouldUseRemote()) {
      try {
        result = await Promise.race([
          this.classifyRemotely(processed),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Remote timeout')), this.remoteTimeout),
          ),
        ]);
      } catch (error) {
        logger.debug('Remote classification failed, using local fallback');
        this.handleRemoteFailure();
      }
    }

    if (!result) {
      try {
        const tensor = this.prepareTensorInput(processed);
        const output = this.gestureModel.runSync([tensor]) as any[];
        const predictions = output[0] as number[];
        const { gesture, confidence } = this.processModelOutput(predictions);

        result = {
          label: gesture,
          confidence,
          isLocal: true,
          timestamp: Date.now(),
          suggestions: [],
          requiresConfirmation: confidence < this.confidenceThreshold,
        };
      } catch (error) {
        console.error('Local gesture classification failed:', error);
        result = this.createUncertainResult('Local inference error');
      }
    }

    if (result) {
      const smoothed = this.applyGestureSmoothing(result);
      if (!smoothed) {
        onResult(null);
        return;
      }

      result = smoothed;
      const processingTime = Date.now() - processed.timestamp;
      this.logInteraction({
        label: result.label,
        confidence: result.confidence,
        isLocal: result.isLocal,
        wasSuccessful: result.label !== 'uncertain',
        processingTimeMs: processingTime,
      });
    }

    onResult(result);
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
        data.requiresConfirmation || data.confidence < this.confidenceThreshold,
    };
  }

  private prepareTensorInput(data: ProcessedFrame): number[] {
    return data.landmarks.flat();
  }

  private processModelOutput(output: number[]): { gesture: string; confidence: number } {
    const maxConfidence = Math.max(...output);
    const idx = output.indexOf(maxConfidence);
    const gesture = this.labels[idx] || 'unknown';
    return { gesture, confidence: maxConfidence };
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
      (r) => r.confidence > this.confidenceThreshold,
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
      };
      this.addCollectedSample(processed);
      logger.info(`Recorded sample for session ${sessionId}`);
    }
  }
}

export const mlService = new MachineLearningService();

export const useGestureClassifier = (
  onResult: (result: DetailedGestureResult | null) => void,
  isProcessing: boolean,
) => {
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;

  const lastProcessedTime = useSharedValue(0);
  const processingCooldown = 1000; // ms
  const isServiceReady = mlService.isServiceReady();

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      const now = Date.now();
      if (isProcessingRef.current || now - lastProcessedTime.value < processingCooldown) {
        return;
      }
      lastProcessedTime.value = now;

      if (!isServiceReady) {
        return;
      }

      try {
        const landmarks = extractHandLandmarks(frame);
        if (!landmarks || landmarks.length === 0) {
          return;
        }

        const processed: ProcessedFrame = {
          landmarks,
          width: frame.width,
          height: frame.height,
          timestamp: now,
        };
        
        runOnJS(mlService.processFrameAsync.bind(mlService))(processed, onResultRef.current);

      } catch (error: any) {
        console.error('WORKLET ERROR:', error.message);
      }
    },
    [isServiceReady],
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

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      if (!isRecordingRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastProcessedTime.value < 1000 / fps) {
        return;
      }
      lastProcessedTime.value = now;

      try {
        const landmarks = extractHandLandmarks(frame);
        if (!landmarks || landmarks.length === 0) {
          return;
        }
        runOnJS(onLandmarksRef.current)(landmarks);
      } catch (error: any) {
        console.error('WORKLET ERROR:', error.message);
      }
    },
    [fps],
  );

  return frameProcessor;
};
