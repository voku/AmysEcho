/**
 * Tests for Enhanced Gesture Configuration Management - Amy First
 *
 * Ensures the configuration system properly adapts to Amy's needs
 * and provides context-aware settings.
 */

import { loadConfig, getAdaptiveConfig, updateAmyPreferences, validateConfig } from '../src/webview/config/GestureConfig';

// Mock window object for testing
const mockWindow = {
  __mlpThreshold: 0.35,
  __fallbackThreshold: 0.25,
  __facingMode: 'environment',
  __mirrorOverlay: false,
  __gestureSizeTolerance: 0.4,
  __amyIntensity: 'gentle',
  __amyTimeBased: true,
  __amyContextAware: true
};

(global as any).window = mockWindow;

describe('GestureConfig', () => {
  beforeEach(() => {
    // Reset window config for each test
    Object.assign(mockWindow, {
      __mlpThreshold: 0.35,
      __fallbackThreshold: 0.25,
      __facingMode: 'environment',
      __mirrorOverlay: false,
      __gestureSizeTolerance: 0.4,
      __amyIntensity: 'gentle',
      __amyTimeBased: true,
      __amyContextAware: true
    });
  });

  describe('Configuration Loading', () => {
    test('loads configuration with window overrides', () => {
      const config = loadConfig();

      expect(config.thresholds.mlpConfidence).toBe(0.35);
      expect(config.thresholds.fallbackConfidence).toBe(0.25);
      expect(config.camera.facingMode).toBe('environment');
      expect(config.camera.mirrorOverlay).toBe(false);
      expect(config.gestures.sizeTolerance).toBe(0.4);
    });

    test('loads Amy preferences from window', () => {
      const config = loadConfig();

      expect(config.amyPreferences.intensity).toBe('gentle');
      expect(config.amyPreferences.timeBasedAdjustments).toBe(true);
      expect(config.amyPreferences.contextAwareness).toBe(true);
    });

    test('falls back to defaults when window config unavailable', () => {
      // Clear window config
      delete mockWindow.__mlpThreshold;
      delete mockWindow.__amyIntensity;

      const config = loadConfig();

      expect(config.thresholds.mlpConfidence).toBe(0.4); // Default
      expect(config.amyPreferences.intensity).toBe('normal'); // Default
    });
  });

  describe('Adaptive Configuration', () => {
    test('applies time-based adjustments for morning', () => {
      const baseConfig = loadConfig();

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        timeOfDay: 'morning'
      });

      // Morning should have gentler thresholds
      expect(adaptiveConfig.thresholds.mlpConfidence).toBeLessThan(baseConfig.thresholds.mlpConfidence);
      expect(adaptiveConfig.gestures.sizeTolerance).toBeGreaterThan(baseConfig.gestures.sizeTolerance);
    });

    test('applies time-based adjustments for afternoon', () => {
      const baseConfig = loadConfig();

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        timeOfDay: 'afternoon'
      });

      // Afternoon should have stricter thresholds for learning
      expect(adaptiveConfig.thresholds.mlpConfidence).toBeGreaterThan(baseConfig.thresholds.mlpConfidence);
      expect(adaptiveConfig.gestures.sizeTolerance).toBeLessThan(baseConfig.gestures.sizeTolerance);
    });

    test('applies activity-based adjustments', () => {
      const baseConfig = loadConfig();

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        activity: 'high'
      });

      // High activity should have gentler settings
      expect(adaptiveConfig.performance.messageThrottleMs).toBeGreaterThan(baseConfig.performance.messageThrottleMs);
      expect(adaptiveConfig.gestures.sizeTolerance).toBeGreaterThan(baseConfig.gestures.sizeTolerance);
    });

    test('adjusts for favorite gestures', () => {
      const baseConfig = loadConfig();
      baseConfig.amyPreferences.favoriteGestures = ['thumbs_up'];

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        gesture: 'thumbs_up'
      });

      // Favorite gestures should have lower thresholds
      expect(adaptiveConfig.thresholds.mlpConfidence).toBeLessThan(baseConfig.thresholds.mlpConfidence);
    });

    test('adjusts for challenging gestures', () => {
      const baseConfig = loadConfig();
      baseConfig.amyPreferences.challengingGestures = ['complex_gesture'];

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        gesture: 'complex_gesture'
      });

      // Challenging gestures should have higher tolerance
      expect(adaptiveConfig.gestures.sizeTolerance).toBeGreaterThan(baseConfig.gestures.sizeTolerance);
    });

    test('respects time-based adjustment preferences', () => {
      const baseConfig = loadConfig();
      baseConfig.amyPreferences.timeBasedAdjustments = false;

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        timeOfDay: 'morning'
      });

      // Should not adjust if time-based adjustments are disabled
      expect(adaptiveConfig.thresholds.mlpConfidence).toBe(baseConfig.thresholds.mlpConfidence);
    });

    test('respects context awareness preferences', () => {
      const baseConfig = loadConfig();
      baseConfig.amyPreferences.contextAwareness = false;

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        activity: 'high'
      });

      // Should not adjust if context awareness is disabled
      expect(adaptiveConfig.performance.messageThrottleMs).toBe(baseConfig.performance.messageThrottleMs);
    });
  });

  describe('Amy Preferences Management', () => {
    test('updates Amy preferences correctly', () => {
      const baseConfig = loadConfig();

      const updatedConfig = updateAmyPreferences(baseConfig, {
        intensity: 'strong',
        timeBasedAdjustments: false
      });

      expect(updatedConfig.amyPreferences.intensity).toBe('strong');
      expect(updatedConfig.amyPreferences.timeBasedAdjustments).toBe(false);
      expect(updatedConfig.amyPreferences.contextAwareness).toBe(true); // Unchanged
    });

    test('handles partial preference updates', () => {
      const baseConfig = loadConfig();

      const updatedConfig = updateAmyPreferences(baseConfig, {
        favoriteGestures: ['thumbs_up', 'wave']
      });

      expect(updatedConfig.amyPreferences.favoriteGestures).toEqual(['thumbs_up', 'wave']);
      expect(updatedConfig.amyPreferences.intensity).toBe('gentle'); // Unchanged
    });

    test('validates preference values', () => {
      const baseConfig = loadConfig();

      // Should handle invalid values gracefully
      expect(() => {
        updateAmyPreferences(baseConfig, { intensity: 'invalid' as any });
      }).not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    test('validates correct configuration', () => {
      const config = loadConfig();
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('detects invalid thresholds', () => {
      const config = loadConfig();
      config.thresholds.mlpConfidence = 1.5; // Invalid

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MLP confidence threshold must be between 0 and 1');
    });

    test('detects invalid performance settings', () => {
      const config = loadConfig();
      config.performance.messageThrottleMs = -100; // Invalid

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Message throttle must be non-negative');
    });

    test('detects invalid timing settings', () => {
      const config = loadConfig();
      config.timing.loadTimeoutMs = 500; // Too low

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Load timeout must be at least 1000ms');
    });
  });

  describe('Edge Cases', () => {
    test('handles missing context gracefully', () => {
      const baseConfig = loadConfig();

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {});

      // Should return base config when no context provided
      expect(adaptiveConfig).toEqual(baseConfig);
    });

    test('handles unknown gestures gracefully', () => {
      const baseConfig = loadConfig();

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        gesture: 'unknown_gesture'
      });

      // Should not crash and return base config
      expect(adaptiveConfig.thresholds.mlpConfidence).toBe(baseConfig.thresholds.mlpConfidence);
    });

    test('handles invalid time of day gracefully', () => {
      const baseConfig = loadConfig();

      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        timeOfDay: 'invalid' as any
      });

      // Should not apply invalid time adjustments
      expect(adaptiveConfig).toEqual(baseConfig);
    });

    test('prevents configuration values from going out of bounds', () => {
      const baseConfig = loadConfig();
      baseConfig.amyPreferences.favoriteGestures = ['thumbs_up'];

      // Create a scenario that might push values out of bounds
      const adaptiveConfig = getAdaptiveConfig(baseConfig, {
        gesture: 'thumbs_up',
        timeOfDay: 'morning'
      });

      // Values should remain within valid ranges
      expect(adaptiveConfig.thresholds.mlpConfidence).toBeGreaterThanOrEqual(0);
      expect(adaptiveConfig.thresholds.mlpConfidence).toBeLessThanOrEqual(1);
      expect(adaptiveConfig.gestures.sizeTolerance).toBeGreaterThanOrEqual(0);
      expect(adaptiveConfig.gestures.sizeTolerance).toBeLessThanOrEqual(1);
    });
  });
});