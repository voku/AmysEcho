/**
 * Two-Hand Gesture Service Tests - Amy First
 *
 * Comprehensive tests for two-hand gesture recognition with best practices:
 * - Validation testing for edge cases
 * - Confidence scoring accuracy
 * - Performance monitoring
 * - Accessibility compliance
 * - Error handling robustness
 */

import { twoHandGestureService, TwoHandGestureService } from '../../src/services/twoHandGestureService';
import { TWO_HAND_GESTURES } from '../../src/constants/twoHandGestures';

// Mock performance monitor
jest.mock('../../src/services/performanceMonitor', () => ({
  performanceMonitor: {
    recordMetric: jest.fn(),
    recordProcessingTime: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TwoHandGestureService', () => {
  beforeEach(() => {
    // Clear any cached gestures
    twoHandGestureService.clearCache();
    jest.clearAllMocks();

    // Mock performance.now for consistent timing
    let mockTime = 1000;
    jest.spyOn(performance, 'now').mockImplementation(() => {
      mockTime += 10; // Simulate 10ms processing time
      return mockTime;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = TwoHandGestureService.getInstance();
      const instance2 = TwoHandGestureService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should return the exported singleton', () => {
      const instance = TwoHandGestureService.getInstance();
      expect(instance).toBe(twoHandGestureService);
    });
  });

  describe('Input Validation', () => {
    it('should reject gestures with insufficient confidence', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'Thumb_Up',
        'Open_Palm',
        0.3, // Below minimum threshold
        0.8,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).toBeNull();
    });

    it('should reject gestures with missing handedness data', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'Thumb_Up',
        'Open_Palm',
        0.8,
        0.8,
        [], // Empty handedness
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).toBeNull();
    });

    it('should reject gestures with insufficient landmark data', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'Thumb_Up',
        'Open_Palm',
        0.8,
        0.8,
        ['Left', 'Right'],
        [[[0, 0, 0]]] // Only one hand
      );

      expect(result).toBeNull();
    });

    it('should handle empty gesture strings gracefully', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        '',
        'Open_Palm',
        0.8,
        0.8,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).toBeNull();
    });
  });

  describe('Gesture Matching', () => {
    it('should match exact two-hand gestures', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou', // Please gesture
        'ILoveYou', // Please gesture
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      expect(result?.gesture.id).toBe('please-both-hands');
      expect(result?.confidence).toBeGreaterThan(0.8);
    });

    it('should match gestures with reversed handedness', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.9,
        0.9,
        ['Right', 'Left'], // Reversed handedness
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      expect(result?.gesture.id).toBe('please-both-hands');
    });

    it('should handle fuzzy matching for similar gestures', async () => {
      // Test with gestures that don't have exact matches but are similar
      const result = await twoHandGestureService.processTwoHandGesture(
        'Thumb_Up',
        'Thumb_Up',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      expect(result?.gesture.id).toBe('happy-both-hands');
    });

    it('should return null for unmatched gesture combinations', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'Unknown_Gesture_1',
        'Unknown_Gesture_2',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).toBeNull();
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate confidence using geometric mean', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.8,
        0.6,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      // Geometric mean of 0.8 and 0.6 is sqrt(0.8 * 0.6) ≈ 0.693
      expect(result?.confidence).toBeCloseTo(0.693, 2);
    });

    it('should apply difficulty multipliers', async () => {
      // Test easy gesture
      const easyResult = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.8,
        0.8,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      // Test medium difficulty gesture
      const mediumResult = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'Thumb_Up',
        0.8,
        0.8,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(easyResult).not.toBeNull();
      expect(mediumResult).not.toBeNull();

      // Easy gesture should have higher confidence
      if (easyResult && mediumResult) {
        expect(easyResult.confidence).toBeGreaterThanOrEqual(mediumResult.confidence);
      }
    });

    it('should boost confidence for emergency gestures', async () => {
      const emergencyResult = await twoHandGestureService.processTwoHandGesture(
        'Pointing_Up',
        'Pointing_Up',
        0.7,
        0.7,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(emergencyResult).not.toBeNull();
      expect(emergencyResult?.gesture.category).toBe('emergency');
      expect(emergencyResult?.confidence).toBeGreaterThan(0.6); // Should be boosted
    });

    it('should reject gestures below confidence threshold', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.5,
        0.5,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      // Geometric mean is sqrt(0.5 * 0.5) = 0.5, below threshold
      expect(result).toBeNull();
    });
  });

  describe('Accessibility Features', () => {
    it('should generate appropriate accessibility hints', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      expect(result?.accessibilityHints).toContain('Beide Hände: Bitte (beide Hände)');
      expect(result?.accessibilityHints.length).toBeGreaterThan(1);
    });

    it('should provide confidence-based accessibility feedback', async () => {
      const highConfidenceResult = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.95,
        0.95,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(highConfidenceResult).not.toBeNull();
      expect(highConfidenceResult?.accessibilityHints).toContain('Sehr sicher erkannt');
    });

    it('should provide category-specific accessibility hints', async () => {
      const emergencyResult = await twoHandGestureService.processTwoHandGesture(
        'Pointing_Up',
        'Pointing_Up',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(emergencyResult).not.toBeNull();
      expect(emergencyResult?.accessibilityHints).toContain('Notfall-Geste erkannt - Hilfe wird geleistet');
    });
  });

  describe('Caching', () => {
    it('should cache successful gesture detections', async () => {
      const cacheKey = 'ILoveYou_ILoveYou_Left_Right';

      // First detection
      const result1 = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result1).not.toBeNull();

      // Check cache
      const cached = twoHandGestureService.getCachedGesture(
        'ILoveYou',
        'ILoveYou',
        ['Left', 'Right']
      );

      expect(cached).not.toBeNull();
      expect(cached?.gesture.id).toBe(result1?.gesture.id);
    });

    it('should clear cache when requested', async () => {
      // Add something to cache
      await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      // Clear cache
      twoHandGestureService.clearCache();

      // Check cache is empty
      const cached = twoHandGestureService.getCachedGesture(
        'ILoveYou',
        'ILoveYou',
        ['Left', 'Right']
      );

      expect(cached).toBeNull();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track processing time', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      expect(result?.processingTime).toBeGreaterThan(0);
      expect(result?.processingTime).toBeLessThan(100); // Should be fast
    });

    it('should provide performance metrics', () => {
      const metrics = twoHandGestureService.getPerformanceMetrics();

      expect(metrics).toHaveProperty('cacheSize');
      expect(metrics).toHaveProperty('averageProcessingTime');
      expect(metrics).toHaveProperty('totalProcessed');
      expect(typeof metrics.cacheSize).toBe('number');
      expect(typeof metrics.averageProcessingTime).toBe('number');
      expect(typeof metrics.totalProcessed).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle processing errors gracefully', async () => {
      // Test with invalid landmarks that might cause errors
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.9,
        0.9,
        ['Left', 'Right'],
        [] // Empty landmarks array
      );

      expect(result).toBeNull();
    });

    it('should log errors appropriately', async () => {
      const logger = require('../../src/utils/logger').logger;

      // Force an error by passing invalid data that should trigger validation failure
      await twoHandGestureService.processTwoHandGesture(
        '', // Empty gesture name
        'ILoveYou',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Gesture Library Access', () => {
    it('should provide access to all available gestures', () => {
      const gestures = twoHandGestureService.getAvailableGestures();

      expect(Array.isArray(gestures)).toBe(true);
      expect(gestures.length).toBeGreaterThan(0);
      expect(gestures[0]).toHaveProperty('id');
      expect(gestures[0]).toHaveProperty('name');
      expect(gestures[0]).toHaveProperty('category');
    });

    it('should filter gestures by category', () => {
      const emergencyGestures = twoHandGestureService.getGesturesByCategory('emergency');
      const communicationGestures = twoHandGestureService.getGesturesByCategory('communication');

      expect(emergencyGestures.length).toBeGreaterThan(0);
      expect(communicationGestures.length).toBeGreaterThan(0);

      emergencyGestures.forEach(gesture => {
        expect(gesture.category).toBe('emergency');
      });

      communicationGestures.forEach(gesture => {
        expect(gesture.category).toBe('communication');
      });
    });

    it('should filter gestures by difficulty', () => {
      const easyGestures = twoHandGestureService.getGesturesByDifficulty('easy');
      const mediumGestures = twoHandGestureService.getGesturesByDifficulty('medium');

      expect(easyGestures.length).toBeGreaterThan(0);

      easyGestures.forEach(gesture => {
        expect(gesture.difficulty).toBe('easy');
      });

      mediumGestures.forEach(gesture => {
        expect(gesture.difficulty).toBe('medium');
      });
    });
  });

  describe('Validation Edge Cases', () => {
    it('should handle identical gestures on both hands appropriately', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      expect(result?.gesture.id).toBe('please-both-hands');
    });

    it('should validate gesture complementarity', async () => {
      // Test complementary gestures (more + please)
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'Thumb_Up',
        0.9,
        0.9,
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      expect(result?.gesture.id).toBe('more-both-hands');
    });

    it('should handle very asymmetric confidence levels', async () => {
      const result = await twoHandGestureService.processTwoHandGesture(
        'ILoveYou',
        'ILoveYou',
        0.9, // High confidence
        0.5, // Low confidence
        ['Left', 'Right'],
        [[[0, 0, 0]], [[0, 0, 0]]]
      );

      expect(result).not.toBeNull();
      // Should still work but with reduced confidence due to geometric mean
      expect(result?.confidence).toBeCloseTo(Math.sqrt(0.9 * 0.5), 2);
    });
  });
});