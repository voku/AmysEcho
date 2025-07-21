import type { Frame } from 'react-native-vision-camera';
let TensorflowModel: any = null;
let loadTensorflowModel: any = null;
try { ({ TensorflowModel, loadTensorflowModel } = require('react-native-fast-tflite')); } catch {}
let runOnJS: any = () => {}; try { ({ runOnJS } = require('react-native-worklets-core')); } catch {}
import { logger } from '../utils/logger';
import { extractHandLandmarks, setHandLandmarkModel } from '../utils/landmarkExtractor';
import { DetailedGestureResult, ProcessedFrame, MLServiceConfig } from '../types/ml';

class MachineLearningService {
  private landmarkModel: any = null;
  private gestureModel: any = null;
  private isReady = false;
  private confidenceThreshold = 0.7;
  private labels = ['danke', 'wasser', 'mehr', 'fertig'];
  private teachingSession: { id: string; label: string } | null = null;

  async loadModels(
    landmark: any,
    gesture: any,
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
    this.isReady = !!this.landmarkModel && !!this.gestureModel;
    logger.info('ML models are now ready.');
  }

  isServiceReady = (): boolean => this.isReady;

  classifyGesture(
    onResult: (result: DetailedGestureResult | null) => void,
  ) {
    return (frame: Frame) => {
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
      const tensor = this.prepareTensorInput(processed);
      try {
        const output = this.gestureModel!.runSync([tensor]) as any[];
        const predictions = output[0] as number[];
        const { gesture, confidence } = this.processModelOutput(predictions);
        runOnJS(onResult)({
          label: gesture,
          confidence,
          isLocal: true,
          timestamp: Date.now(),
          suggestions: [],
          requiresConfirmation: confidence < this.confidenceThreshold,
        });
      } catch (e) {
        console.error('Gesture classification failed', e);
        runOnJS(onResult)(this.createUncertainResult('Inference error'));
      }
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
