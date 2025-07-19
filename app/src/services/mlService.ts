/* eslint-disable react-hooks/rules-of-hooks */
import { TensorflowModel as TfliteModel } from 'react-native-fast-tflite';
import { runOnJS } from 'react-native-reanimated';
import { Frame } from 'react-native-vision-camera';
import { logger } from '../utils/logger';
import { loadCustomModelUri } from '../storage';
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
  private landmarkModel: TfliteModel | null = null;
  private gestureModel: TfliteModel | null = null;
  private cloudEndpoint = '';
  private confidenceThreshold = 0.7;

  async loadModels(
    landmarkTflite: TfliteModel,
    gestureTflite: TfliteModel,
    config?: {
      cloudEndpoint?: string;
      confidenceThreshold?: number;
    },
  ): Promise<void> {
    if (config?.cloudEndpoint) this.cloudEndpoint = config.cloudEndpoint;
    if (config?.confidenceThreshold) this.confidenceThreshold = config.confidenceThreshold;
    try {
      this.landmarkModel = landmarkTflite;
      this.gestureModel = gestureTflite;

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

  classifyGesture = (onResult: (result: GestureResult | null) => void) => {
    return (frame: Frame) => {
      'worklet';
      if (!this.landmarkModel || !this.gestureModel) {
        return;
      }
      try {
        const landmarkResults = this.landmarkModel.runSync([new Float32Array(frame.toArrayBuffer())]);
        const landmarks = landmarkResults[0];

        if (landmarks && landmarks.length > 0) {
          const gestureResults = this.gestureModel.runSync([landmarks]);
          const predictions = gestureResults[0] as Float32Array;
          let bestIndex = 0;
          let bestScore = 0;
          for (let i = 0; i < predictions.length; i++) {
            if (predictions[i] > bestScore) {
              bestScore = predictions[i];
              bestIndex = i;
            }
          }
          const bestPrediction: GestureResult = {
            label: gestureLabels[bestIndex] || 'unknown',
            confidence: bestScore,
          };
          runOnJS(onResult)(bestPrediction);
        } else {
          runOnJS(onResult)(null);
        }
      } catch (e) {
        logger.error('Error during gesture classification:', e);
      }
    };
  };

  async classifyLandmarks(landmarks: number[][]): Promise<DetailedGestureResult> {
    if (!this.gestureModel) {
      throw new Error('Models not loaded');
    }

    if (this.cloudEndpoint) {
      try {
        const response = await fetch(this.cloudEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ landmarks }),
        });
        if (response.ok) {
          const data = await response.json();
          return {
            label: data.gesture,
            confidence: data.confidence,
            isLocal: false,
            timestamp: Date.now(),
            suggestions: data.suggestions || [],
            requiresConfirmation: data.confidence < this.confidenceThreshold,
          };
        }
        logger.warn(`Cloud classification failed with ${response.status}`);
      } catch (err) {
        logger.warn('Cloud classification error', err);
      }
    }

    const flattenedLandmarks = [];
    for (const arr of landmarks) {
      flattenedLandmarks.push(...arr);
    }
    const gestureResults = this.gestureModel.runSync([new Float32Array(flattenedLandmarks)]);
    const predictions = gestureResults[0] as Float32Array;
    let bestIndex = 0;
    let bestScore = 0;
    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] > bestScore) {
        bestScore = predictions[i];
        bestIndex = i;
      }
    }
    return {
      label: gestureLabels[bestIndex] || 'unknown',
      confidence: bestScore,
      isLocal: true,
      timestamp: Date.now(),
      suggestions: [],
      requiresConfirmation: bestScore < this.confidenceThreshold,
    };
  }
}

export const mlService = new MachineLearningService();
