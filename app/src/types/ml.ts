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
  predictions?: ClassificationOutput;
}

export interface GestureResult {
  label: string;
  confidence: number;
  ts: number;
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
}
