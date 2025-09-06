/**
 * Configuration for gesture detection system
 * Centralized settings for performance, thresholds, and behavior
 */

export interface GestureDetectorConfig {
  performance: {
    telemetrySampleRate: number;
    messageThrottleMs: number;
    confidenceChangeThreshold: number;
  };
  thresholds: {
    mlpConfidence: number;
    fallbackConfidence: number;
    emergencyConfidence: number;
  };
  camera: {
    facingMode: string;
    mirrorOverlay: boolean;
    idealWidth: number;
    idealHeight: number;
  };
  gestures: {
    sizeTolerance: number;
    partialThreshold: number;
    completionTimeout: number;
  };
  timing: {
    loadTimeoutMs: number;
    emergencyCooldownMs: number;
    frameLatencySampleInterval: number;
  };
}

/**
 * Default configuration values
 */
export const defaultConfig: GestureDetectorConfig = {
  performance: {
    telemetrySampleRate: 30, // Sample every 30 frames
    messageThrottleMs: 100, // Throttle messages to 100ms
    confidenceChangeThreshold: 0.05, // 5% confidence change threshold
  },
  thresholds: {
    mlpConfidence: 0.4,
    fallbackConfidence: 0.3,
    emergencyConfidence: 0.3,
  },
  camera: {
    facingMode: 'user',
    mirrorOverlay: true,
    idealWidth: 1280,
    idealHeight: 720,
  },
  gestures: {
    sizeTolerance: 0.3,
    partialThreshold: 0.6,
    completionTimeout: 2000,
  },
  timing: {
    loadTimeoutMs: 8000,
    emergencyCooldownMs: 1000,
    frameLatencySampleInterval: 90,
  },
};

/**
 * Load configuration from window object with fallbacks
 */
export function loadConfig(): GestureDetectorConfig {
  const config = { ...defaultConfig };

  // Load from window object if available
  const windowConfig = (window as any);
  if (windowConfig) {
    config.thresholds.mlpConfidence = windowConfig.__mlpThreshold ?? config.thresholds.mlpConfidence;
    config.thresholds.fallbackConfidence = windowConfig.__fallbackThreshold ?? config.thresholds.fallbackConfidence;
    config.camera.facingMode = windowConfig.__facingMode ?? config.camera.facingMode;
    config.camera.mirrorOverlay = windowConfig.__mirrorOverlay ?? config.camera.mirrorOverlay;
    config.gestures.sizeTolerance = windowConfig.__gestureSizeTolerance ?? config.gestures.sizeTolerance;
  }

  return config;
}