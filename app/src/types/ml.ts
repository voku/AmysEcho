export interface ClassificationOutput {
  probabilities: ReadonlyArray<number>;
  maxProbability: number;
  maxIndex: number;
}

export interface ProcessedFrame {
  landmarks: number[][];
  landmarksRaw?: number[][];
  width: number;
  height: number;
  timestamp: number;
  processingMs: number;
  fps: number;
  predictions?: ClassificationOutput;
}

export interface GestureResult {
  label: string;
  confidence: number;
  ts: number;
  isLocal?: boolean;
  requiresConfirmation?: boolean;
}

export interface DetailedGestureResult {
  label: string;
  confidence: number;
  isLocal: boolean;
  timestamp: number;
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
