/**
 * Configuration for gesture detection system
 * Centralized settings for performance, thresholds, and behavior
 */
/**
 * Default configuration values
 */
export const defaultConfig = {
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
            thresholds: { mlpConfidence: 0.45, fallbackConfidence: 0.35 },
            gestures: { sizeTolerance: 0.25 }, // Stricter for learning
            performance: { messageThrottleMs: 80 }, // Faster feedback
        },
        eveningMode: {
            // Relaxation-focused settings
            thresholds: { mlpConfidence: 0.4, fallbackConfidence: 0.3 },
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
export function loadConfig() {
    var _a, _b, _c, _d, _e;
    const config = Object.assign({}, defaultConfig);
    // Load from window object if available
    const windowConfig = window;
    if (windowConfig) {
        config.thresholds.mlpConfidence = (_a = windowConfig.__mlpThreshold) !== null && _a !== void 0 ? _a : config.thresholds.mlpConfidence;
        config.thresholds.fallbackConfidence = (_b = windowConfig.__fallbackThreshold) !== null && _b !== void 0 ? _b : config.thresholds.fallbackConfidence;
        config.camera.facingMode = (_c = windowConfig.__facingMode) !== null && _c !== void 0 ? _c : config.camera.facingMode;
        config.camera.mirrorOverlay = (_d = windowConfig.__mirrorOverlay) !== null && _d !== void 0 ? _d : config.camera.mirrorOverlay;
        config.gestures.sizeTolerance = (_e = windowConfig.__gestureSizeTolerance) !== null && _e !== void 0 ? _e : config.gestures.sizeTolerance;
        // Load Amy's preferences if available
        if (windowConfig.__amyIntensity) {
            config.amyPreferences.intensity = windowConfig.__amyIntensity;
        }
        if (windowConfig.__amyTimeBased !== undefined) {
            config.amyPreferences.timeBasedAdjustments = windowConfig.__amyTimeBased;
        }
        if (windowConfig.__amyContextAware !== undefined) {
            config.amyPreferences.contextAwareness = windowConfig.__amyContextAware;
        }
    }
    return config;
}
/**
 * Amy First: Get context-aware configuration based on current conditions
 */
export function getAdaptiveConfig(baseConfig, context) {
    const adaptiveConfig = Object.assign({}, baseConfig);
    if (!baseConfig.amyPreferences.timeBasedAdjustments && !baseConfig.amyPreferences.contextAwareness) {
        return adaptiveConfig;
    }
    // Apply time-based adjustments
    if ((context === null || context === void 0 ? void 0 : context.timeOfDay) && baseConfig.amyPreferences.timeBasedAdjustments) {
        const timeMode = `${context.timeOfDay}Mode`;
        const timeSettings = baseConfig.adaptiveSettings[timeMode];
        if (timeSettings) {
            applyPartialConfig(adaptiveConfig, timeSettings);
        }
    }
    // Apply activity-based adjustments
    if ((context === null || context === void 0 ? void 0 : context.activity) && context.activity !== 'normal' && baseConfig.amyPreferences.contextAwareness) {
        const activityMode = `${context.activity}ActivityMode`;
        const activitySettings = baseConfig.adaptiveSettings[activityMode];
        if (activitySettings) {
            applyPartialConfig(adaptiveConfig, activitySettings);
        }
    }
    // Apply gesture-specific adjustments
    if ((context === null || context === void 0 ? void 0 : context.gesture) && baseConfig.amyPreferences.contextAwareness) {
        if (baseConfig.amyPreferences.favoriteGestures.includes(context.gesture)) {
            // Slightly lower threshold for favorite gestures
            adaptiveConfig.thresholds.mlpConfidence = Math.max(0.3, adaptiveConfig.thresholds.mlpConfidence - 0.05);
        }
        else if (baseConfig.amyPreferences.challengingGestures.includes(context.gesture)) {
            // Slightly higher tolerance for challenging gestures
            adaptiveConfig.gestures.sizeTolerance = Math.min(0.5, adaptiveConfig.gestures.sizeTolerance + 0.1);
        }
    }
    return adaptiveConfig;
}
/**
 * Apply partial configuration updates
 */
function applyPartialConfig(target, source) {
    // Deep merge partial configuration
    Object.keys(source).forEach(key => {
        const sourceValue = source[key];
        const targetValue = target[key];
        if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
            // Recursively merge nested objects
            Object.assign(targetValue, sourceValue);
        }
        else if (sourceValue !== undefined) {
            // Direct assignment for primitives and arrays
            target[key] = sourceValue;
        }
    });
}
/**
 * Update Amy's preferences dynamically
 */
export function updateAmyPreferences(config, preferences) {
    var _a, _b;
    const updatedConfig = Object.assign({}, config);
    updatedConfig.amyPreferences = Object.assign(Object.assign({}, updatedConfig.amyPreferences), preferences);
    // Send updated preferences to React Native for persistence
    try {
        (_b = (_a = window.ReactNativeWebView) === null || _a === void 0 ? void 0 : _a.postMessage) === null || _b === void 0 ? void 0 : _b.call(_a, JSON.stringify({
            type: 'amy_preferences_update',
            preferences: updatedConfig.amyPreferences,
            timestamp: Date.now()
        }));
    }
    catch (error) {
        console.warn('Failed to send Amy preferences update:', error);
    }
    return updatedConfig;
}
/**
 * Validate configuration values
 */
export function validateConfig(config) {
    const errors = [];
    // Validate thresholds
    if (config.thresholds.mlpConfidence < 0 || config.thresholds.mlpConfidence > 1) {
        errors.push('MLP confidence threshold must be between 0 and 1');
    }
    if (config.thresholds.fallbackConfidence < 0 || config.thresholds.fallbackConfidence > 1) {
        errors.push('Fallback confidence threshold must be between 0 and 1');
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
