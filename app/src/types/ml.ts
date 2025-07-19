export interface ProcessedFrame {
  landmarks: number[][];
  width: number;
  height: number;
  timestamp: number;
}

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

export interface MLServiceConfig {
  modelPath?: string;
  fallbackModelPath?: string;
  cloudEndpoint?: string;
  confidenceThreshold?: number;
}
