import type { Frame } from 'react-native-vision-camera';
let FileSystem: typeof import('expo-file-system') | null = null;

let TensorflowModel: any = null;
let loadTensorflowModel: any = null;
try {
  const tflite = require('react-native-fast-tflite');
  TensorflowModel = tflite.TensorflowModel;
  loadTensorflowModel = tflite.loadTensorflowModel;
} catch (e) {
  console.warn('TensorFlow Lite not available:', e);
}

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
import { extractHandLandmarks, setHandLandmarkModel } from '../utils/landmarkExtractor';
import { DetailedGestureResult, ProcessedFrame, MLServiceConfig } from '../types/ml';
import { API_TOKEN, API_URL, CONFIDENCE_THRESHOLD } from '../constants';
import { database } from '../../db';
import { InteractionLog } from '../../db/models';

// Default gesture labels will be supplied when models are loaded

class MachineLearningService {
  private landmarkModel: any = null;
  private gestureModel: any = null;
  private isReady = false;
  private confidenceThreshold = 0.7;
  private labels: string[] = [];
  private teachingSession: { id: string; label: string } | null = null;
  private collectedSamples: ProcessedFrame[] = [];
  private lastProcessedTime = 0;
  private processingCooldown = 1000;

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
      logger.info('Loading custom models...');

      this.landmarkModel = landmark;
      setHandLandmarkModel?.(landmark);

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
        this.gestureModel = await loadTensorflowModel(modelPath);
      } else {
        this.gestureModel = gesture;
      }

      if (config?.confidenceThreshold) {
        this.confidenceThreshold = config.confidenceThreshold;
      }

      this.labels = labels;
      this.isReady = !!this.landmarkModel && !!this.gestureModel;

      logger.info('Custom models loaded successfully');
    } catch (error) {
      logger.error('Failed to load custom models:', error);
      this.isReady = false;
    }
  }

  isServiceReady = (): boolean => this.isReady;

  classifyGesture(onResult: (result: DetailedGestureResult | null) => void) {
    return (frame: Frame) => {
      'worklet';

      const now = Date.now();
      if (now - this.lastProcessedTime < this.processingCooldown) {
        return;
      }
      this.lastProcessedTime = now;

      if (!this.isReady) {
        console.log('ML Service not ready');
        runOnJS(onResult)(this.createUncertainResult('Service not ready'));
        return;
      }

      try {
        console.log('Processing frame...');
        const landmarks = extractHandLandmarks(frame);
        console.log('Landmarks:', landmarks ? landmarks.length : 0);

        if (!landmarks || landmarks.length === 0) {
          runOnJS(onResult)(this.createUncertainResult('No landmarks detected'));
          return;
        }

        const processed: ProcessedFrame = {
          landmarks,
          width: frame.width,
          height: frame.height,
          timestamp: now,
        };

        runOnJS(this.processFrameAsync)(processed, onResult);
      } catch (error) {
        console.error('Frame processing error:', error);
        runOnJS(onResult)(this.createUncertainResult('Processing error'));
      }
    };
  }
  private async processFrameAsync(
    processed: ProcessedFrame,
    onResult: (result: DetailedGestureResult | null) => void,
  ): Promise<void> {
    let result: DetailedGestureResult | null = null;

    try {
      result = await Promise.race([
        this.classifyRemotely(processed),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Remote timeout')), 500),
        ),
      ]);
    } catch (error) {
      logger.debug('Remote classification failed, using local fallback');
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
      this.logInteraction({
        label: result.label,
        confidence: result.confidence,
        isLocal: result.isLocal,
        wasSuccessful: result.label !== 'uncertain',
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

  private createUncertainResult(reason: string): DetailedGestureResult {
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

  private async logInteraction(data: {
    label: string;
    confidence: number;
    isLocal: boolean;
    wasSuccessful: boolean;
  }) {
    try {
      await database.write(async () => {
        await database.get<InteractionLog>('interaction_logs').create((log) => {
          log.sessionId = 'current_session';
          log.gestureDefinitionId = data.label;
          log.wasSuccessful = data.wasSuccessful;
          log.confidenceScore = data.confidence;
          log.inputType = data.isLocal ? 'local_ml' : 'remote_ml';
          log.processingTimeMs = 0;
          log.environmentalContext = 'unknown';
          log.createdAt = new Date();
        });
      });
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

