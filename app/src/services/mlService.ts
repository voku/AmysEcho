import type { Frame } from 'react-native-vision-camera';
let TensorflowModel: any = null;
let loadTensorflowModel: any = null;
try { ({ TensorflowModel, loadTensorflowModel } = require('react-native-fast-tflite')); } catch {}
let runOnJS: any = () => {}; try { ({ runOnJS } = require('react-native-worklets-core')); } catch {}
import { logger } from '../utils/logger';
import { extractHandLandmarks, setHandLandmarkModel } from '../utils/landmarkExtractor';
import { DetailedGestureResult, ProcessedFrame, MLServiceConfig } from '../types/ml';
import { API_TOKEN, API_URL, CONFIDENCE_THRESHOLD } from '../constants';
import { database } from '../../db';
import { InteractionLog } from '../../db/models';

class MachineLearningService {
  private landmarkModel: any = null;
  private gestureModel: any = null;
  private isReady = false;
  private confidenceThreshold = 0.7;
  private labels: string[] = []; // This will be populated dynamically or from a fixed list
  private teachingSession: { id: string; label: string } | null = null;
  private collectedSamples: ProcessedFrame[] = [];

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
    labels: string[], // Keep labels for now, might be needed for local model output mapping
    config?: MLServiceConfig,
  ): Promise<void> {
    this.landmarkModel = landmark;
    setHandLandmarkModel(landmark);
    if (typeof gesture === 'string') {
      this.gestureModel = await loadTensorflowModel(gesture as any);
    } else {
      this.gestureModel = gesture;
    }
    if (config?.confidenceThreshold) {
      this.confidenceThreshold = config.confidenceThreshold;
    }
    this.labels = labels; // Assign labels here
    this.isReady = !!this.landmarkModel && !!this.gestureModel;
    logger.info('ML models are now ready.');
  }

  isServiceReady = (): boolean => this.isReady;

  classifyGesture(
    onResult: (result: DetailedGestureResult | null) => void,
  ) {
    return async (frame: Frame) => {
      'worklet';
      if (!this.isReady || !this.landmarkModel || !this.gestureModel) return;

      const landmarks = extractHandLandmarks(frame);
      if (!landmarks || landmarks.length === 0) {
        runOnJS(onResult)(this.createUncertainResult('No landmarks detected'));
        return;
      }

      const processed: ProcessedFrame = {
        landmarks,
        width: frame.width,
        height: frame.height,
        timestamp: Date.now(),
      };

      let result: DetailedGestureResult | null = null;

      // Attempt remote classification first
      try {
        const remoteResult = await this.classifyRemotely(processed);
        if (remoteResult) {
          result = remoteResult;
        }
      } catch (e) {
        logger.warn(`Remote classification failed or timed out: ${e}. Falling back to local.`);
      }

      // Fallback to local classification if remote failed or wasn't attempted
      if (!result) {
        try {
          const tensor = this.prepareTensorInput(processed);
          const output = this.gestureModel!.runSync([tensor]) as any[];
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
        } catch (e) {
          console.error('Local gesture classification failed', e);
          result = this.createUncertainResult('Local inference error');
        }
      }
      runOnJS(onResult)(result);
      // Log the interaction after classification
      if (result) {
        runOnJS(this.logInteraction)({
          label: result.label,
          confidence: result.confidence,
          isLocal: result.isLocal,
          wasSuccessful: result.label !== 'uncertain',
        });
      }
    };
  }

  private async classifyRemotely(
    processedFrame: ProcessedFrame,
  ): Promise<DetailedGestureResult | null> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 400); // 400ms timeout

    try {
      const response = await Promise.race([
        fetch(`${API_URL}/classify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_TOKEN}`,
          },
          body: JSON.stringify({
            landmarks: processedFrame.landmarks,
            width: processedFrame.width,
            height: processedFrame.height,
          }),
          signal: abortController.signal,
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Remote classification timed out')), 400)
        ),
      ]);

      clearTimeout(timeoutId);

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
        requiresConfirmation: data.requiresConfirmation || data.confidence < this.confidenceThreshold,
      };
    } finally {
      clearTimeout(timeoutId);
    }
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
    logger.warn(`Classification uncertain: ${reason}`);
    return {
      label: 'uncertain',
      confidence: 0,
      isLocal: true,
      timestamp: Date.now(),
      suggestions: [],
      requiresConfirmation: true,
    };
  }

  private async logInteraction(data: { label: string; confidence: number; isLocal: boolean; wasSuccessful: boolean }) {
    try {
      await database.write(async () => {
        await database.get<InteractionLog>('interaction_logs').create(log => {
          log.sessionId = 'current_session'; // Replace with actual session ID
          log.gestureDefinitionId = data.label; // Use label as gestureDefinitionId for now
          log.wasSuccessful = data.wasSuccessful;
          log.confidenceScore = data.confidence;
          log.inputType = data.isLocal ? 'local_ml' : 'remote_ml';
          log.processingTimeMs = 0; // Placeholder, actual processing time would be calculated
          log.environmentalContext = 'unknown'; // Placeholder
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
      logger.info(`Recorded sample for session ${sessionId}`);
      // Placeholder: in the future we might store this in a buffer
    }
  }
}

export const mlService = new MachineLearningService();