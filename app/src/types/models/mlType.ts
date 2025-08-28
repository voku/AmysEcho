import { Vector3D,GestureRecognitionResult } from '../';

export interface ClassificationOutput {
  probabilities: ReadonlyArray<number>;
  maxProbability: number;
  maxIndex: number;
}

export interface ProcessedFrame {
  landmarks: Vector3D[][];
  landmarksRaw?: Vector3D[][];
  width: number;
  height: number;
  timestamp: number;
  processingMs: number;
  fps: number;
  predictions?: ClassificationOutput;
}

export interface DetailedGestureResult extends GestureRecognitionResult {
  isLocal: boolean;
  suggestions: string[];
  requiresConfirmation: boolean;
}

export interface MLServiceConfig {
  confidenceThreshold?: number;
  processingTimeout?: number;
  enableRemoteClassification?: boolean;
  remoteRetryMs?: number;
  smootherMinCutOff?: number;
  smootherBeta?: number;
  smootherDerivateCutOff?: number;
  softmaxTemperature?: number;
}
