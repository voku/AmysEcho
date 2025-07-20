import { logger } from '../utils/logger';

export interface GestureResult {
  label: string;
  confidence: number;
}

export interface DetailedGestureResult extends GestureResult {
  isLocal: boolean;
  timestamp: number;
  suggestions: string[];
  requiresConfirmation: boolean;
}

class MachineLearningService {
  private isReady = false;
  private cloudEndpoint = '';
  private confidenceThreshold = 0.7;

  async loadModels(
    landmarkTflite: any, // Simplified for now
    gestureTflite: any, // Simplified for now
    config?: {
      cloudEndpoint?: string;
      confidenceThreshold?: number;
    },
  ): Promise<void> {
    if (config?.cloudEndpoint) this.cloudEndpoint = config.cloudEndpoint;
    if (config?.confidenceThreshold) this.confidenceThreshold = config.confidenceThreshold;
    this.isReady = true;
    logger.info('ML models are now ready (simplified).');
  }

  isServiceReady = (): boolean => this.isReady;

  private async _classifyWithCloud(
    landmarks: number[][],
  ): Promise<DetailedGestureResult | null> {
    // Simplified: always return null for now, no cloud classification
    return null;
  }

  classifyGesture = (
    onResult: (result: DetailedGestureResult | null) => void,
  ) => {
    return (frame: any) => { // Simplified frame type
      'worklet';
      if (!this.isReady) {
        return;
      }

      // Simplified: return a dummy result
      onResult({
        label: 'dummy_gesture',
        confidence: 0.5,
        isLocal: true,
        timestamp: Date.now(),
        suggestions: [],
        requiresConfirmation: false,
      });
    };
  }
}

export const mlService = new MachineLearningService();

