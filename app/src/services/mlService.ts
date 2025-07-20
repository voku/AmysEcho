import {Tensor, TensorflowModel} from 'react-native-fast-tflite';
import { runOnJS } from 'react-native-reanimated';
import { Frame } from 'react-native-vision-camera';
import { logger } from '../utils/logger';
const gestureLabels: string[] = require('../../assets/models/gesture_labels.json');

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
  private landmarkModel: TensorflowModel | null = null;
  private gestureModel: TensorflowModel | null = null;
  private cloudEndpoint = '';
  private confidenceThreshold = 0.7;

  async loadModels(
    landmarkTflite: TensorflowModel,
    gestureTflite: TensorflowModel | string,
    config?: {
      cloudEndpoint?: string;
      confidenceThreshold?: number;
    },
  ): Promise<void> {
    if (config?.cloudEndpoint) this.cloudEndpoint = config.cloudEndpoint;
    if (config?.confidenceThreshold) this.confidenceThreshold = config.confidenceThreshold;
    try {
      this.landmarkModel = landmarkTflite;
      if (typeof gestureTflite === 'string') {
        this.gestureModel = await TensorflowModel.createFromFile(gestureTflite);
      } else {
        this.gestureModel = gestureTflite;
      }

      if (this.landmarkModel && this.gestureModel) {
        this.isReady = true;
        logger.info('Gesture recognition models loaded successfully.');
      }
    } catch (error) {
      logger.error('Failed to load gesture models:', error);
      this.isReady = false;
    }
  }

  isServiceReady = (): boolean => this.isReady;

  private async _classifyWithCloud(
    landmarks: number[][],
  ): Promise<DetailedGestureResult | null> {
    if (!this.cloudEndpoint) {
      return null;
    }

    const timeoutPromise = new Promise<null>(resolve =>
      setTimeout(() => resolve(null), 400),
    ); // 400ms timeout

    try {
      const fetchPromise = fetch(this.cloudEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landmarks }),
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response) {
        logger.warn('Cloud classification timed out.');
        return null;
      }

      if (response instanceof Response && response.ok) {
        const data = await response.json();
        return {
          label: data.gesture,
          confidence: data.confidence,
          isLocal: false,
          timestamp: Date.now(),
          suggestions: data.suggestions || [],
          requiresConfirmation: data.confidence < this.confidenceThreshold,
        };
      } else if (response instanceof Response) {
        logger.warn(`Cloud classification failed with ${response.status}`);
      }
    } catch (err) {
      logger.warn('Cloud classification error:', err);
    }
    return null;
  }

  classifyGesture = (
    onResult: (result: DetailedGestureResult | null) => void,
  ) => {
    return (frame: Frame) => {
      'worklet';
      if (!this.landmarkModel || !this.gestureModel) {
        return;
      }

      try {
        const landmarkResults: Tensor[] = this.landmarkModel.runSync([
          { data: new Uint8Array(frame.toArrayBuffer()), dataType: 'uint8', shape: [1, frame.height, frame.width, 4] }, // Assuming RGBA input for landmark model
        ]);

        const landmarksOutput = landmarkResults[0].data as Float32Array;

        if (landmarksOutput && landmarksOutput.length > 0) {
          const landmarks2D: number[][] = [];
          for (let i = 0; i < landmarksOutput.length; i += 3) { // Assuming output is flattened [x, y, z, x, y, z...]
            landmarks2D.push([
              landmarksOutput[i],
              landmarksOutput[i + 1],
              landmarksOutput[i + 2],
            ]);
          }

          runOnJS(async () => {
            const cloudResult = await this._classifyWithCloud(landmarks2D);
            if (cloudResult) {
              runOnJS(onResult)(cloudResult);
            } else {
              const gestureResults: Tensor[] = this.gestureModel!.runSync([
                { data: landmarksOutput, dataType: 'float32', shape: [1, landmarksOutput.length] }, // Assuming gesture model expects flattened landmarks
              ]);
              const predictions = gestureResults[0].data as Float32Array;
              let bestIndex = 0;
              let bestScore = 0;
              for (let i = 0; i < predictions.length; i++) {
                if (predictions[i] > bestScore) {
                  bestScore = predictions[i];
                  bestIndex = i;
                }
              }
              runOnJS(onResult)({
                label: gestureLabels[bestIndex] || 'unknown',
                confidence: bestScore,
                isLocal: true,
                timestamp: Date.now(),
                suggestions: [],
                requiresConfirmation: bestScore < this.confidenceThreshold,
              });
            }
          })();
        } else {
          runOnJS(onResult)(null);
        }
      } catch (e) {
        logger.error('Error during gesture classification:', e);
        runOnJS(onResult)(null); // Ensure callback is called even on error
      }
    };
  }
}

export const mlService = new MachineLearningService();

