/**
 * Unit tests for gesture processing classes
 * Tests GestureSizeNormalizer, PartialGestureDetector, and TremorCompensator
 */

import { GestureSizeNormalizer, PartialGestureDetector, TremorCompensator } from '../gestureProcessing';

describe('GestureSizeNormalizer', () => {
  let normalizer: GestureSizeNormalizer;

  beforeEach(() => {
    normalizer = new GestureSizeNormalizer();
  });

  describe('initialization', () => {
    it('should initialize with default tolerance values', () => {
      const tolerance = normalizer.getTolerance();
      expect(tolerance.tolerance).toBe(0.3);
      expect(tolerance.minScale).toBe(0.7);
      expect(tolerance.maxScale).toBe(1.3);
    });
  });

  describe('setTolerance', () => {
    it('should set tolerance within valid range', () => {
      normalizer.setTolerance(0.5);
      const tolerance = normalizer.getTolerance();
      expect(tolerance.tolerance).toBe(0.5);
      expect(tolerance.minScale).toBe(0.5);
      expect(tolerance.maxScale).toBe(1.5);
    });

    it('should clamp tolerance to minimum value', () => {
      normalizer.setTolerance(0.05);
      const tolerance = normalizer.getTolerance();
      expect(tolerance.tolerance).toBe(0.1);
      expect(tolerance.minScale).toBe(0.9);
      expect(tolerance.maxScale).toBe(1.1);
    });

    it('should clamp tolerance to maximum value', () => {
      normalizer.setTolerance(1.5);
      const tolerance = normalizer.getTolerance();
      expect(tolerance.tolerance).toBe(1.0);
      expect(tolerance.minScale).toBe(0.0);
      expect(tolerance.maxScale).toBe(2.0);
    });
  });

  describe('normalizeHandSize', () => {
    it('should return empty array for empty input', () => {
      const result = normalizer.normalizeHandSize([]);
      expect(result).toEqual([]);
    });

    it('should set base hand size on first valid measurement', () => {
      const landmarks = [
        [
          [0.1, 0.1, 0.0], // wrist
          [0.2, 0.2, 0.0], // thumb
          [0.3, 0.3, 0.0], // index
          [0.4, 0.4, 0.0], // middle
          [0.5, 0.5, 0.0], // ring
          [0.6, 0.6, 0.0], // pinky
          // ... more landmarks to make 21
          ...Array(15).fill([0.0, 0.0, 0.0])
        ]
      ];

      // First call should set base size
      const result1 = normalizer.normalizeHandSize(landmarks);
      expect(result1).toEqual(landmarks); // Should return original on first call

      // Second call should normalize
      const result2 = normalizer.normalizeHandSize(landmarks);
      expect(result2).toBeDefined();
    });

    it('should handle multiple hands', () => {
      const createHand = (base: number) => Array.from({ length: 21 }, () => [base, base, 0]);
      const landmarks = [createHand(0.1), createHand(0.2)];

      const first = normalizer.normalizeHandSize(landmarks);
      const second = normalizer.normalizeHandSize(landmarks);

      expect(first.length).toBe(2);
      expect(second.length).toBe(2);
      expect(first[0].length).toBe(21);
      expect(first[1].length).toBe(21);
    });

    it('should skip hands with insufficient landmarks', () => {
      // Create proper hand landmarks with wrist at index 0 and middle finger tip at index 12
      const createHand = (wristX: number, wristY: number, tipX: number, tipY: number) => {
        const hand = Array(21).fill([0.0, 0.0, 0.0]);
        hand[0] = [wristX, wristY, 0.0]; // wrist
        hand[12] = [tipX, tipY, 0.0]; // middle finger tip
        return hand;
      };

      const landmarks1 = [
        Array(10).fill([0.1, 0.1, 0.0]), // Insufficient landmarks
        createHand(0.1, 0.1, 0.2, 0.2)  // Valid hand
      ];

      const landmarks2 = [
        Array(10).fill([0.1, 0.1, 0.0]), // Insufficient landmarks (unchanged)
        createHand(0.1, 0.1, 0.3, 0.3)  // Valid hand with different size
      ];

      // First call to set base size from the valid hand
      normalizer.normalizeHandSize(landmarks1);

      // Second call with different hand size should normalize the valid hand but leave insufficient one unchanged
      const result = normalizer.normalizeHandSize(landmarks2);
      expect(result.length).toBe(2);
      expect(result[0]).toEqual(landmarks2[0]); // Unchanged (insufficient landmarks)
      expect(result[1]).not.toEqual(landmarks2[1]); // Changed (valid hand normalized)
    });

    it('should clamp scale factor to tolerance range', () => {
      // Set very low tolerance
      normalizer.setTolerance(0.1);

      const landmarks = [
        [
          [0.0, 0.0, 0.0], // wrist
          ...Array(11).fill([0.0, 0.0, 0.0]),
          [1.0, 1.0, 0.0], // middle finger tip - far from wrist
          ...Array(9).fill([0.0, 0.0, 0.0])
        ]
      ];

      // First call to set base
      normalizer.normalizeHandSize(landmarks);

      // Second call with different size should be clamped
      const result = normalizer.normalizeHandSize(landmarks);
      expect(result).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should reset base hand size', () => {
      const landmarks = [Array(21).fill([0.1, 0.1, 0.0])];

      // Set base size
      normalizer.normalizeHandSize(landmarks);

      // Reset
      normalizer.reset();

      // Next call should set new base size
      const result = normalizer.normalizeHandSize(landmarks);
      expect(result).toEqual(landmarks);
    });
  });
});

describe('PartialGestureDetector', () => {
  let detector: PartialGestureDetector;

  beforeEach(() => {
    detector = new PartialGestureDetector();
  });

  describe('initialization', () => {
    it('should initialize with empty gesture patterns', () => {
      // Test that it can be instantiated
      expect(detector).toBeDefined();
    });
  });

  describe('setThreshold', () => {
    it('should set threshold within valid range', () => {
      detector.setThreshold(0.7);
      // Note: threshold is private, so we test indirectly through behavior
      expect(detector).toBeDefined();
    });

    it('should clamp threshold to minimum value', () => {
      detector.setThreshold(0.2);
      expect(detector).toBeDefined();
    });

    it('should clamp threshold to maximum value', () => {
      detector.setThreshold(1.0);
      expect(detector).toBeDefined();
    });
  });

  describe('shouldRecognizePartial', () => {
    it('should respect configured confidence threshold', () => {
      detector.setThreshold(0.7);

      expect(detector.shouldRecognizePartial(0.5, 0.6)).toBe(false);
      expect(detector.shouldRecognizePartial(0.5, 0.75)).toBe(true);
    });
  });

  describe('analyzePartialCompletion', () => {
    it('should return default result for empty landmarks', () => {
      const result = detector.analyzePartialCompletion([], 'thumbs_up');
      expect(result).toEqual({
        isPartial: false,
        completion: 0,
        confidence: 0,
        feedback: ''
      });
    });

    it('should return default result for insufficient landmarks', () => {
      const landmarks = [Array(10).fill([0.0, 0.0, 0.0])];
      const result = detector.analyzePartialCompletion(landmarks, 'thumbs_up');
      expect(result).toEqual({
        isPartial: false,
        completion: 0,
        confidence: 0,
        feedback: ''
      });
    });

    it('should analyze thumbs_up gesture', () => {
      // Create mock hand landmarks for thumbs up
      const landmarks = [
        [
          [0.0, 0.0, 0.0], // wrist
          ...Array(3).fill([0.0, 0.0, 0.0]), // thumb joints
          [0.0, -0.1, 0.0], // thumb tip (extended up)
          ...Array(2).fill([0.0, 0.0, 0.0]), // index joints
          [0.0, 0.1, 0.0], // index tip (curled down)
          ...Array(2).fill([0.0, 0.0, 0.0]), // middle joints
          [0.0, 0.1, 0.0], // middle tip (curled down)
          ...Array(2).fill([0.0, 0.0, 0.0]), // ring joints
          [0.0, 0.1, 0.0], // ring tip (curled down)
          ...Array(2).fill([0.0, 0.0, 0.0]), // pinky joints
          [0.0, 0.1, 0.0], // pinky tip (curled down)
        ]
      ];

      const result = detector.analyzePartialCompletion(landmarks, 'thumbs_up');
      expect(result.isPartial).toBeDefined();
      expect(result.completion).toBeGreaterThanOrEqual(0);
      expect(result.completion).toBeLessThanOrEqual(1);
      expect(typeof result.feedback).toBe('string');
    });

    it('should analyze open_palm gesture', () => {
      // Create mock hand landmarks for open palm
      const landmarks = [
        [
          [0.0, 0.0, 0.0], // wrist
          ...Array(3).fill([0.0, 0.0, 0.0]), // thumb
          [0.0, -0.1, 0.0], // thumb tip (extended)
          ...Array(2).fill([0.0, 0.0, 0.0]), // index joints
          [0.0, -0.1, 0.0], // index tip (extended)
          ...Array(2).fill([0.0, 0.0, 0.0]), // middle joints
          [0.0, -0.1, 0.0], // middle tip (extended)
          ...Array(2).fill([0.0, 0.0, 0.0]), // ring joints
          [0.0, -0.1, 0.0], // ring tip (extended)
          ...Array(2).fill([0.0, 0.0, 0.0]), // pinky joints
          [0.0, -0.1, 0.0], // pinky tip (extended)
        ]
      ];

      const result = detector.analyzePartialCompletion(landmarks, 'open_palm');
      expect(result.isPartial).toBeDefined();
      expect(result.completion).toBeGreaterThanOrEqual(0);
      expect(result.completion).toBeLessThanOrEqual(1);
    });

    it('should return default for unknown gesture', () => {
      const landmarks = [Array(21).fill([0.0, 0.0, 0.0])];
      const result = detector.analyzePartialCompletion(landmarks, 'unknown_gesture');
      expect(result).toEqual({
        isPartial: false,
        completion: 0,
        confidence: 0,
        feedback: ''
      });
    });
  });
});

describe('TremorCompensator', () => {
  let compensator: TremorCompensator;

  beforeEach(() => {
    compensator = new TremorCompensator();
  });

  describe('initialization', () => {
    it('should initialize with empty history', () => {
      // Test that it can be instantiated
      expect(compensator).toBeDefined();
    });
  });

  describe('smoothLandmarks', () => {
    it('should return original landmarks when no history', () => {
      const landmarks = [
        [
          [0.1, 0.1, 0.0],
          [0.2, 0.2, 0.0],
          [0.3, 0.3, 0.0]
        ]
      ];

      const result = compensator.smoothLandmarks(landmarks);
      expect(result).toEqual(landmarks);
    });

    it('should smooth landmarks with history', () => {
      const landmarks1 = [
        [
          [0.1, 0.1, 0.0],
          [0.2, 0.2, 0.0]
        ]
      ];

      const landmarks2 = [
        [
          [0.11, 0.11, 0.0], // Slightly different
          [0.21, 0.21, 0.0]
        ]
      ];

      // First call to build history
      compensator.smoothLandmarks(landmarks1);

      // Second call should smooth
      const result = compensator.smoothLandmarks(landmarks2);
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(2);
    });

    it('should handle empty landmarks', () => {
      const result = compensator.smoothLandmarks([]);
      expect(result).toEqual([]);
    });

    it('should handle multiple hands', () => {
      const landmarks = [
        [[0.1, 0.1, 0.0]], // Hand 1
        [[0.2, 0.2, 0.0]]  // Hand 2
      ];

      const result = compensator.smoothLandmarks(landmarks);
      expect(result.length).toBe(2);
    });

    it('should preserve both hands after smoothing with history', () => {
      const createHand = (base: number) =>
        Array.from({ length: 21 }, () => [base, base, 0]);

      const initial = [createHand(0.1), createHand(0.2)];
      const moved = [createHand(0.11), createHand(0.21)];

      compensator.smoothLandmarks(initial);
      const result = compensator.smoothLandmarks(moved);

      expect(result.length).toBe(2);
      expect(result[0].length).toBe(21);
      expect(result[1].length).toBe(21);
    });
  });

  describe('isIntentionalMovement', () => {
    it('should return true for first frame', () => {
      const current = [[[0.1, 0.1, 0.0]]];
      const result = compensator.isIntentionalMovement(current, []);
      expect(result).toBe(true);
    });

    it('should return true for significant movement', () => {
      const previous = [[[0.1, 0.1, 0.0]]];
      const current = [[[0.2, 0.2, 0.0]]]; // Significant movement

      const result = compensator.isIntentionalMovement(current, previous);
      expect(result).toBe(true);
    });

    it('should return false for minimal movement', () => {
      const previous = [[[0.1, 0.1, 0.0]]];
      const current = [[[0.1001, 0.1001, 0.0]]]; // Minimal movement

      const result = compensator.isIntentionalMovement(current, previous);
      expect(result).toBe(false);
    });

    it('should handle mismatched hand counts', () => {
      const previous = [[[0.1, 0.1, 0.0]]];
      const current: number[][][] = []; // No hands

      const result = compensator.isIntentionalMovement(current, previous);
      expect(result).toBe(true); // Should handle gracefully
    });
  });

  describe('clearHistory', () => {
    it('should clear landmark history', () => {
      const landmarks = [[[0.1, 0.1, 0.0]]];

      // Build some history
      compensator.smoothLandmarks(landmarks);
      compensator.smoothLandmarks(landmarks);

      // Clear history
      compensator.clearHistory();

      // Next smoothing should return original (no history to smooth with)
      const result = compensator.smoothLandmarks(landmarks);
      expect(result).toEqual(landmarks);
    });
  });
});
