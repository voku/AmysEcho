/**
 * Configuration for gesture detection system
 * Centralized settings for performance, thresholds, and behavior
 */

export interface GestureDetectorConfig {
  performance: {
    telemetrySampleRate: number;
    messageThrottleMs: number;
    confidenceChangeThreshold: number;
    targetFrameRate?: number;
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
  processing?: {
    sizeTolerance: number;
    partialThreshold: number;
    landmarkChangeThreshold: number;
  };
  // Amy First: Context-aware and adaptive configuration
  amyPreferences: {
    intensity: 'gentle' | 'normal' | 'strong';
    timeBasedAdjustments: boolean;
    contextAwareness: boolean;
    favoriteGestures: string[];
    challengingGestures: string[];
  };
  adaptiveSettings: {
    morningMode: GestureConfigOverrides;
    afternoonMode: GestureConfigOverrides;
    eveningMode: GestureConfigOverrides;
    highActivityMode: GestureConfigOverrides;
    lowActivityMode: GestureConfigOverrides;
  };
}

type GestureConfigOverrides = {
  [K in keyof GestureDetectorConfig]?: GestureDetectorConfig[K] extends object
    ? Partial<GestureDetectorConfig[K]>
    : GestureDetectorConfig[K];
};

/**
 * Default configuration values
 */
export const defaultConfig: GestureDetectorConfig = {
  performance: {
    telemetrySampleRate: 30, // Sample every 30 frames
    messageThrottleMs: 100, // Throttle messages to 100ms
    confidenceChangeThreshold: 0.05, // 5% confidence change threshold
    targetFrameRate: 30,
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
  processing: {
    sizeTolerance: 0.3,
    partialThreshold: 0.6,
    landmarkChangeThreshold: 0.01,
  },
  // Amy First: Default preferences and adaptive settings
  amyPreferences: {
    intensity: 'normal',
    timeBasedAdjustments: true,
    contextAwareness: true,
    favoriteGestures: [],
    challengingGestures: [],
  },
  adaptiveSettings: {
    morningMode: {
      // Gentler settings for morning routine
      thresholds: { mlpConfidence: 0.35, fallbackConfidence: 0.25 },
      gestures: { sizeTolerance: 0.4 }, // More tolerant for morning
      timing: { emergencyCooldownMs: 1500 }, // Slightly longer cooldown
    },
    afternoonMode: {
      // Learning-focused settings
      thresholds: { mlpConfidence: 0.25, fallbackConfidence: 0.35 },
      gestures: { sizeTolerance: 0.25 }, // Stricter for learning
      performance: { messageThrottleMs: 80 }, // Faster feedback
    },
    eveningMode: {
      // Relaxation-focused settings
      thresholds: { mlpConfidence: 0.2, fallbackConfidence: 0.3 },
      gestures: { sizeTolerance: 0.35 },
      timing: { emergencyCooldownMs: 1200 },
    },
    highActivityMode: {
      // When Amy is very active
      performance: { messageThrottleMs: 120 }, // Slightly slower to prevent overwhelm
      gestures: { sizeTolerance: 0.4 }, // More tolerant
    },
    lowActivityMode: {
      // When Amy is less active
      performance: { messageThrottleMs: 90 }, // Faster feedback to encourage
      gestures: { sizeTolerance: 0.3 }, // Standard tolerance
    },
  },
};

/**
 * Load configuration from window object with fallbacks
 */
export function loadConfig(): GestureDetectorConfig {
  const config: GestureDetectorConfig = structuredClone(defaultConfig);

  const windowOverrides: GestureConfigOverrides = {};

  if (typeof window.__mlpThreshold === 'number') {
    windowOverrides.thresholds = {
      ...(windowOverrides.thresholds ?? {}),
      mlpConfidence: window.__mlpThreshold,
    };
  }

  if (typeof window.__fallbackThreshold === 'number') {
    windowOverrides.thresholds = {
      ...(windowOverrides.thresholds ?? {}),
      fallbackConfidence: window.__fallbackThreshold,
    };
  }

  if (typeof window.__facingMode === 'string') {
    windowOverrides.camera = {
      ...(windowOverrides.camera ?? {}),
      facingMode: window.__facingMode,
    };
  }

  if (typeof window.__mirrorOverlay === 'boolean') {
    windowOverrides.camera = {
      ...(windowOverrides.camera ?? {}),
      mirrorOverlay: window.__mirrorOverlay,
    };
  }

  if (typeof window.__gestureSizeTolerance === 'number') {
    windowOverrides.gestures = {
      ...(windowOverrides.gestures ?? {}),
      sizeTolerance: window.__gestureSizeTolerance,
    };
  }

  const amyIntensity = window.__amyIntensity;
  if (amyIntensity) {
    windowOverrides.amyPreferences = {
      ...(windowOverrides.amyPreferences ?? {}),
      intensity: amyIntensity,
    };
  }

  if (window.__amyTimeBased !== undefined) {
    windowOverrides.amyPreferences = {
      ...(windowOverrides.amyPreferences ?? {}),
      timeBasedAdjustments: window.__amyTimeBased,
    };
  }

  if (window.__amyContextAware !== undefined) {
    windowOverrides.amyPreferences = {
      ...(windowOverrides.amyPreferences ?? {}),
      contextAwareness: window.__amyContextAware,
    };
  }

  if (Object.keys(windowOverrides).length > 0) {
    applyPartialConfig(config, windowOverrides);
  }

  return config;
}

/**
 * Amy First: Get context-aware configuration based on current conditions
 */
export function getAdaptiveConfig(
  baseConfig: GestureDetectorConfig,
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    activity?: 'high' | 'low' | 'normal';
    gesture?: string;
    confidence?: number;
  }
): GestureDetectorConfig {
  const adaptiveConfig: GestureDetectorConfig =
    typeof structuredClone === 'function' ? structuredClone(baseConfig) : JSON.parse(JSON.stringify(baseConfig));

  if (!baseConfig.amyPreferences.timeBasedAdjustments && !baseConfig.amyPreferences.contextAwareness) {
    return adaptiveConfig;
  }

  // Apply time-based adjustments
  if (context?.timeOfDay && baseConfig.amyPreferences.timeBasedAdjustments) {
    const timeMode = `${context.timeOfDay}Mode` as keyof typeof baseConfig.adaptiveSettings;
    const timeSettings = baseConfig.adaptiveSettings[timeMode];

    if (timeSettings) {
      applyPartialConfig(adaptiveConfig, timeSettings);
    }
  }

  // Apply activity-based adjustments
  if (context?.activity && context.activity !== 'normal' && baseConfig.amyPreferences.contextAwareness) {
    const activityMode = `${context.activity}ActivityMode` as keyof typeof baseConfig.adaptiveSettings;
    const activitySettings = baseConfig.adaptiveSettings[activityMode];

    if (activitySettings) {
      applyPartialConfig(adaptiveConfig, activitySettings);
    }
  }

  // Apply gesture-specific adjustments
  if (context?.gesture && baseConfig.amyPreferences.contextAwareness) {
    if (baseConfig.amyPreferences.favoriteGestures.includes(context.gesture)) {
      // Slightly lower threshold for favorite gestures
      adaptiveConfig.thresholds.mlpConfidence = Math.max(0.3, adaptiveConfig.thresholds.mlpConfidence - 0.05);
    } else if (baseConfig.amyPreferences.challengingGestures.includes(context.gesture)) {
      // Slightly higher tolerance for challenging gestures
      adaptiveConfig.gestures.sizeTolerance = Math.min(0.5, adaptiveConfig.gestures.sizeTolerance + 0.1);
    }
  }

  return adaptiveConfig;
}

/**
 * Apply partial configuration updates
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyPartialConfig(target: GestureDetectorConfig, source: GestureConfigOverrides): void {
  const gesturesOverride = source.gestures as Partial<GestureDetectorConfig['gestures']> | undefined;
  const processingOverride =
    source.processing as Partial<NonNullable<GestureDetectorConfig['processing']>> | undefined;

  Object.entries(source).forEach(([key, sourceValue]) => {
    if (sourceValue === undefined) {
      return;
    }

    const typedKey = key as keyof GestureDetectorConfig;
    const targetValue = target[typedKey];
    const targetRecord = target as Record<keyof GestureDetectorConfig, unknown>;

    if (isRecord(targetValue) && isRecord(sourceValue)) {
      Object.assign(targetValue, sourceValue);
    } else {
      targetRecord[typedKey] = sourceValue as unknown;
    }
  });

  if (gesturesOverride && target.processing) {
    if (processingOverride?.sizeTolerance === undefined && typeof gesturesOverride.sizeTolerance === 'number') {
      target.processing.sizeTolerance = gesturesOverride.sizeTolerance;
    }

    if (
      processingOverride?.partialThreshold === undefined &&
      typeof gesturesOverride.partialThreshold === 'number'
    ) {
      target.processing.partialThreshold = gesturesOverride.partialThreshold;
    }
  }
}

/**
 * Update Amy's preferences dynamically
 */
export function updateAmyPreferences(
  config: GestureDetectorConfig,
  preferences: Partial<GestureDetectorConfig['amyPreferences']>
): GestureDetectorConfig {
  const updatedConfig = { ...config };
  updatedConfig.amyPreferences = { ...updatedConfig.amyPreferences, ...preferences };

  // Send updated preferences to React Native for persistence
  try {
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'amy_preferences_update',
        preferences: updatedConfig.amyPreferences,
        timestamp: Date.now()
      })
    );
  } catch (error) {
    console.warn('Failed to send Amy preferences update:', error);
  }

  return updatedConfig;
}

/**
 * Validate configuration values
 */
export function validateConfig(config: GestureDetectorConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate thresholds
  if (config.thresholds.mlpConfidence < 0 || config.thresholds.mlpConfidence > 1) {
    errors.push('MLP confidence threshold must be between 0 and 1');
  }

  if (config.thresholds.fallbackConfidence < 0 || config.thresholds.fallbackConfidence > 1) {
    errors.push('Fallback confidence threshold must be between 0 and 1');
  }

  if (config.thresholds.emergencyConfidence < 0 || config.thresholds.emergencyConfidence > 1) {
    errors.push('Emergency confidence threshold must be between 0 and 1');
  }

  // Validate performance settings
  if (config.performance.messageThrottleMs < 0) {
    errors.push('Message throttle must be non-negative');
  }

  // Validate timing settings
  if (config.timing.loadTimeoutMs < 1000) {
    errors.push('Load timeout must be at least 1000ms');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}