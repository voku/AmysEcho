export interface ProcessedFrame {
  landmarks: number[][];
  width: number;
  height: number;
  timestamp: number;
}

export interface GestureResult {
  gesture: string;
  confidence: number;
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
