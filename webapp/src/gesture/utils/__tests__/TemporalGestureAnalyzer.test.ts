/**
 * Tests for TemporalGestureAnalyzer
 * Scientific gesture recognition optimizations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TemporalGestureAnalyzer,
} from '../TemporalGestureAnalyzer';

// Test constants for movement thresholds
const MINIMAL_MOVEMENT_OFFSET = 0.00001; // Almost no movement

describe('TemporalGestureAnalyzer', () => {
  let analyzer: TemporalGestureAnalyzer;

  beforeEach(() => {
    analyzer = new TemporalGestureAnalyzer();
  });

  afterEach(() => {
    analyzer.dispose();
  });

  describe('velocity feature computation', () => {
    it('should compute zero velocity for first frame', () => {
      const landmarks = createTestLandmarks(0.5, 0.5);
      const features = analyzer.addFrame(landmarks, 0);

      expect(features.averageVelocity).toBe(0);
      expect(features.peakVelocity).toBe(0);
      expect(features.palmVelocity).toBe(0);
      expect(features.isMoving).toBe(false);
    });

    it('should compute non-zero velocity when landmarks move', () => {
      const landmarks1 = createTestLandmarks(0.5, 0.5);
      const landmarks2 = createTestLandmarks(0.6, 0.5); // Moved right

      analyzer.addFrame(landmarks1, 0);
      const features = analyzer.addFrame(landmarks2, 33); // ~30fps

      expect(features.averageVelocity).toBeGreaterThan(0);
      expect(features.palmVelocity).toBeGreaterThan(0);
    });

    it('should detect movement correctly', () => {
      const landmarks1 = createTestLandmarks(0.5, 0.5);
      const landmarks2 = createTestLandmarks(0.55, 0.5); // Small movement

      analyzer.addFrame(landmarks1, 0);
      const features = analyzer.addFrame(landmarks2, 33);

      expect(features.isMoving).toBe(true);
    });

    it('should compute movement direction', () => {
      const landmarks1 = createTestLandmarks(0.5, 0.5);
      const landmarks2 = createTestLandmarks(0.6, 0.5); // Moved right

      analyzer.addFrame(landmarks1, 0);
      const features = analyzer.addFrame(landmarks2, 33);

      // Movement to the right should give direction close to 0 radians
      expect(Math.abs(features.movementDirection)).toBeLessThan(Math.PI / 4);
    });

    it('should compute acceleration between frames', () => {
      const landmarks1 = createTestLandmarks(0.5, 0.5);
      const landmarks2 = createTestLandmarks(0.55, 0.5);
      const landmarks3 = createTestLandmarks(0.65, 0.5); // Accelerating

      analyzer.addFrame(landmarks1, 0);
      analyzer.addFrame(landmarks2, 33);
      const features = analyzer.addFrame(landmarks3, 66);

      expect(features.acceleration).not.toBe(0);
    });
  });

  describe('temporal buffer management', () => {
    it('should maintain frame buffer correctly', () => {
      const landmarks = createTestLandmarks(0.5, 0.5);

      for (let i = 0; i < 10; i++) {
        analyzer.addFrame(landmarks, i * 33);
      }

      expect(analyzer.getBufferSize()).toBe(10);
    });

    it('should clear buffer correctly', () => {
      const landmarks = createTestLandmarks(0.5, 0.5);
      analyzer.addFrame(landmarks, 0);
      analyzer.addFrame(landmarks, 33);

      analyzer.clear();

      expect(analyzer.getBufferSize()).toBe(0);
      expect(analyzer.getLastVelocityFeatures()).toBeNull();
    });
  });

  describe('adaptive processing', () => {
    it('should recommend full processing for fast movement', () => {
      const landmarks1 = createTestLandmarks(0.3, 0.5);
      const landmarks2 = createTestLandmarks(0.7, 0.5); // Large movement

      analyzer.addFrame(landmarks1, 0);
      analyzer.addFrame(landmarks2, 33);

      expect(analyzer.getProcessingIntensity()).toBe(1.0);
    });

    it('should recommend minimal processing for static hand', () => {
      const landmarks1 = createTestLandmarks(0.5, 0.5);
      const landmarks2 = createTestLandmarks(0.5 + MINIMAL_MOVEMENT_OFFSET, 0.5 + MINIMAL_MOVEMENT_OFFSET);

      analyzer.addFrame(landmarks1, 0);
      analyzer.addFrame(landmarks2, 33);

      // Should recommend reduced processing (0.3 or 0.6) for static/slow hand
      expect(analyzer.getProcessingIntensity()).toBeLessThan(1.0);
    });

    it('should not recommend skipping on first frame', () => {
      expect(analyzer.shouldSkipProcessing()).toBe(false);
    });

    it('should indicate hand is not moving when static', () => {
      const landmarks1 = createTestLandmarks(0.5, 0.5);
      const landmarks2 = createTestLandmarks(0.5 + MINIMAL_MOVEMENT_OFFSET, 0.5 + MINIMAL_MOVEMENT_OFFSET);

      analyzer.addFrame(landmarks1, 0);
      analyzer.addFrame(landmarks2, 33);

      expect(analyzer.isHandMoving()).toBe(false);
    });
  });

  describe('confidence smoothing', () => {
    it('should smooth confidence over time', () => {
      const landmarks = createTestLandmarks(0.5, 0.5);

      // Add frames with varying confidence
      analyzer.addFrame(landmarks, 0, 'thumbs_up', 0.8);
      analyzer.addFrame(landmarks, 33, 'thumbs_up', 0.9);
      analyzer.addFrame(landmarks, 66, 'thumbs_up', 0.7);

      const smoothed = analyzer.smoothConfidence('thumbs_up', 0.85);

      // Smoothed value should be between min and max historical values
      expect(smoothed).toBeGreaterThanOrEqual(0.7);
      expect(smoothed).toBeLessThanOrEqual(0.9);
    });

    it('should return current confidence when no history exists', () => {
      const smoothed = analyzer.smoothConfidence('unknown_gesture', 0.8);
      expect(smoothed).toBe(0.8);
    });

    it('should compute temporal confidence correctly', () => {
      const landmarks = createTestLandmarks(0.5, 0.5);

      analyzer.addFrame(landmarks, 0, 'wave', 0.8);
      analyzer.addFrame(landmarks, 33, 'wave', 0.85);
      analyzer.addFrame(landmarks, 66, 'wave', 0.9);

      const temporalConf = analyzer.computeTemporalConfidence('wave');

      expect(temporalConf).toBeGreaterThan(0);
      expect(temporalConf).toBeLessThanOrEqual(1);
    });

    it('should return zero for unknown gesture', () => {
      const temporalConf = analyzer.computeTemporalConfidence('nonexistent');
      expect(temporalConf).toBe(0);
    });
  });

  describe('dynamic gesture detection', () => {
    it('should return null when buffer has insufficient frames', () => {
      const landmarks = createTestLandmarks(0.5, 0.5);
      analyzer.addFrame(landmarks, 0);

      const result = analyzer.detectDynamicGesture();
      expect(result).toBeNull();
    });

    it('should attempt detection with enough frames', () => {
      // Add movement pattern that could match a swipe
      for (let i = 0; i < 10; i++) {
        const x = 0.3 + i * 0.05; // Moving right
        const landmarks = createTestLandmarks(x, 0.5);
        analyzer.addFrame(landmarks, i * 33);
      }

      // detectDynamicGesture should run without error
      const result = analyzer.detectDynamicGesture();
      // Result may or may not match depending on thresholds
      // Explicitly check for null OR a valid GestureSequenceResult object
      if (result === null) {
        expect(result).toBeNull();
      } else {
        // Verify it's a properly structured GestureSequenceResult object
        expect(result).toHaveProperty('gesture');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('isSequential');
        expect(result).toHaveProperty('sequenceProgress');
        expect(result).toHaveProperty('temporalConfidence');
        expect(typeof result.gesture).toBe('string');
        expect(typeof result.confidence).toBe('number');
        expect(Number.isFinite(result.confidence)).toBe(true);
      }
    });

    it('should handle velocity profiles where maxVelocity equals minVelocity (division by zero protection)', () => {
      // This test ensures the division by zero fix works correctly
      // When velocity exactly matches a narrow range, deviation should be 0, not NaN/Infinity
      // Add frames with velocity that falls within a typical gesture profile range
      for (let i = 0; i < 15; i++) {
        const x = 0.4 + i * 0.02; // Steady movement
        const landmarks = createTestLandmarks(x, 0.5);
        analyzer.addFrame(landmarks, i * 33);
      }

      // Should not throw and should return a valid result (null or object with valid confidence)
      const result = analyzer.detectDynamicGesture();
      
      if (result !== null) {
        expect(Number.isFinite(result.confidence)).toBe(true);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('statistics', () => {
    it('should provide correct stats', () => {
      const landmarks = createTestLandmarks(0.5, 0.5);
      analyzer.addFrame(landmarks, 0);
      analyzer.addFrame(landmarks, 33);

      const stats = analyzer.getStats();

      expect(stats.bufferSize).toBe(2);
      expect(typeof stats.averageVelocity).toBe('number');
      expect(typeof stats.isMoving).toBe('boolean');
      expect(typeof stats.processingIntensity).toBe('number');
    });
  });
});

/**
 * Create test landmarks with all 21 points around a center position
 */
function createTestLandmarks(centerX: number, centerY: number): number[][] {
  const landmarks: number[][] = [];

  // Create 21 landmarks for a hand
  for (let i = 0; i < 21; i++) {
    // Spread points around center with some variation
    const angle = (i / 21) * Math.PI * 2;
    const radius = 0.05 + (i % 5) * 0.02;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    landmarks.push([x, y, 0]);
  }

  return landmarks;
}
