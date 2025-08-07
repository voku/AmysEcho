export interface ProcessedFrame {
  landmarks: number[][];
  width: number;
  height: number;
  timestamp: number;
  predictions?: number[];
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
