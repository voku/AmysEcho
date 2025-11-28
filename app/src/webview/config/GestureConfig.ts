type AmyIntensity = 'gentle' | 'normal' | 'strong';

export type AmyPreferences = {
  intensity: AmyIntensity;
  timeBasedAdjustments: boolean;
  contextAwareness: boolean;
  favoriteGestures?: string[];
  challengingGestures?: string[];
};

export type GestureConfig = {
  thresholds: {
    mlpConfidence: number;
    fallbackConfidence: number;
  };
  camera: {
    facingMode: 'user' | 'environment';
    mirrorOverlay: boolean;
  };
  gestures: {
    sizeTolerance: number; // 0..1 (higher = more tolerant)
  };
  performance: {
    messageThrottleMs: number;
  };
  timing: {
    loadTimeoutMs: number;
  };
  amyPreferences: AmyPreferences;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function loadConfig(): GestureConfig {
  const w: any = (globalThis as any).window ?? {};
  const defaults: GestureConfig = {
    thresholds: {
      mlpConfidence: 0.4,
      fallbackConfidence: 0.3,
    },
    camera: {
      facingMode: 'user',
      mirrorOverlay: true,
    },
    gestures: {
      sizeTolerance: 0.3,
    },
    performance: {
      messageThrottleMs: 250,
    },
    timing: {
      loadTimeoutMs: 5000,
    },
    amyPreferences: {
      intensity: 'normal',
      timeBasedAdjustments: true,
      contextAwareness: true,
      favoriteGestures: [],
      challengingGestures: [],
    },
  };

  // Apply window overrides if present
  const cfg: GestureConfig = {
    ...defaults,
    thresholds: {
      mlpConfidence: typeof w.__mlpThreshold === 'number' ? w.__mlpThreshold : defaults.thresholds.mlpConfidence,
      fallbackConfidence:
        typeof w.__fallbackThreshold === 'number' ? w.__fallbackThreshold : defaults.thresholds.fallbackConfidence,
    },
    camera: {
      facingMode: w.__facingMode === 'environment' ? 'environment' : 'user',
      mirrorOverlay: typeof w.__mirrorOverlay === 'boolean' ? w.__mirrorOverlay : defaults.camera.mirrorOverlay,
    },
    gestures: {
      sizeTolerance:
        typeof w.__gestureSizeTolerance === 'number' ? w.__gestureSizeTolerance : defaults.gestures.sizeTolerance,
    },
    amyPreferences: {
      ...defaults.amyPreferences,
      intensity: ['gentle', 'normal', 'strong'].includes(w.__amyIntensity)
        ? (w.__amyIntensity as AmyIntensity)
        : defaults.amyPreferences.intensity,
      timeBasedAdjustments:
        typeof w.__amyTimeBased === 'boolean' ? w.__amyTimeBased : defaults.amyPreferences.timeBasedAdjustments,
      contextAwareness:
        typeof w.__amyContextAware === 'boolean' ? w.__amyContextAware : defaults.amyPreferences.contextAwareness,
    },
  };

  // Ensure values are within bounds
  cfg.thresholds.mlpConfidence = clamp01(cfg.thresholds.mlpConfidence);
  cfg.thresholds.fallbackConfidence = clamp01(cfg.thresholds.fallbackConfidence);
  cfg.gestures.sizeTolerance = clamp01(cfg.gestures.sizeTolerance);
  return cfg;
}

export function getAdaptiveConfig(
  base: GestureConfig,
  context: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | string;
    activity?: 'low' | 'medium' | 'high';
    gesture?: string;
  } = {},
): GestureConfig {
  // Start from a shallow clone; deep copy nested parts to avoid mutation
  const cfg: GestureConfig = JSON.parse(JSON.stringify(base));

  // Time-of-day adjustments
  if (cfg.amyPreferences.timeBasedAdjustments && context.timeOfDay) {
    if (context.timeOfDay === 'morning') {
      cfg.thresholds.mlpConfidence = clamp01(cfg.thresholds.mlpConfidence - 0.05);
      cfg.gestures.sizeTolerance = clamp01(cfg.gestures.sizeTolerance + 0.1);
    } else if (context.timeOfDay === 'afternoon') {
      cfg.thresholds.mlpConfidence = clamp01(cfg.thresholds.mlpConfidence + 0.05);
      cfg.gestures.sizeTolerance = clamp01(cfg.gestures.sizeTolerance - 0.1);
    }
    // evening/night keep defaults for now
  }

  // Activity-based adjustments
  if (cfg.amyPreferences.contextAwareness && context.activity) {
    if (context.activity === 'high') {
      cfg.performance.messageThrottleMs = Math.max(0, cfg.performance.messageThrottleMs + 100);
      cfg.gestures.sizeTolerance = clamp01(cfg.gestures.sizeTolerance + 0.1);
    }
  }

  // Gesture-based adjustments
  if (cfg.amyPreferences.contextAwareness && context.gesture) {
    const { favoriteGestures = [], challengingGestures = [] } = cfg.amyPreferences;
    if (favoriteGestures.includes(context.gesture)) {
      cfg.thresholds.mlpConfidence = clamp01(cfg.thresholds.mlpConfidence - 0.05);
    }
    if (challengingGestures.includes(context.gesture)) {
      cfg.gestures.sizeTolerance = clamp01(cfg.gestures.sizeTolerance + 0.1);
    }
  }

  return cfg;
}

export function updateAmyPreferences(
  base: GestureConfig,
  updates: Partial<AmyPreferences>,
): GestureConfig {
  const next = JSON.parse(JSON.stringify(base)) as GestureConfig;
  const allowedIntensities: AmyIntensity[] = ['gentle', 'normal', 'strong'];

  const incoming: AmyPreferences = { ...next.amyPreferences, ...updates } as any;
  if (!allowedIntensities.includes(incoming.intensity)) {
    incoming.intensity = next.amyPreferences.intensity;
  }
  next.amyPreferences = incoming;
  return next;
}

export function validateConfig(config: GestureConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { thresholds, performance, gestures, timing } = config;

  if (!(thresholds.mlpConfidence >= 0 && thresholds.mlpConfidence <= 1)) {
    errors.push('MLP confidence threshold must be between 0 and 1');
  }
  if (!(thresholds.fallbackConfidence >= 0 && thresholds.fallbackConfidence <= 1)) {
    errors.push('Fallback confidence threshold must be between 0 and 1');
  }
  if (!(gestures.sizeTolerance >= 0 && gestures.sizeTolerance <= 1)) {
    errors.push('Gesture size tolerance must be between 0 and 1');
  }
  if (performance.messageThrottleMs < 0) {
    errors.push('Message throttle must be non-negative');
  }
  if (timing.loadTimeoutMs < 1000) {
    errors.push('Load timeout must be at least 1000ms');
  }

  return { valid: errors.length === 0, errors };
}

