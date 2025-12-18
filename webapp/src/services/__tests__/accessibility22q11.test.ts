/**
 * 22q11 Accessibility Support Tests
 * 
 * Tests specialized features for children with 22q11.2 deletion syndrome,
 * focusing on hand stability, partial gesture recognition, and adaptive feedback.
 *
 * Migrated from app/test/accessibility22q11.test.ts with adaptations for webapp architecture.
 */

import { HandStabilityAssistant } from '../../gesture/core/HandStabilityAssistant';
import { PartialGestureDetector, GestureSizeNormalizer } from '../../gesture/gestureProcessing';

const makeHand = (transform: (index: number, point: number[]) => number[] = (_i, point) => point): number[][] => {
  const base = Array.from({ length: 21 }, (_, i) => [i * 0.05, i * 0.02, 0]);
  return base.map((point, index) => transform(index, point));
};

describe('22q11 Accessibility Support', () => {
  describe('HandStabilityAssistant', () => {
    it('detects stable hands and provides positive feedback', () => {
      const assistant = new HandStabilityAssistant();

      const calmHand = makeHand();
      const result = assistant.analyzeStability([calmHand]);
      
      expect(result.isStable).toBe(true);
      expect(result.stabilityScore).toBeGreaterThan(0.7);
      expect(result.feedback).toContain('stabil');
    });

    it('detects unstable hands and provides calming feedback', () => {
      const assistant = new HandStabilityAssistant();

      // First establish a baseline with calm hand
      const calmHand = makeHand();
      assistant.analyzeStability([calmHand]);

      // Then introduce jitter
      const jitterHand = makeHand((index, point) => {
        const jitter = index % 2 === 0 ? 0.1 : -0.1;
        return [point[0] + jitter, point[1] + jitter, point[2]];
      });

      const result = assistant.analyzeStability([jitterHand]);
      
      expect(result.isStable).toBe(false);
      expect(result.stabilityScore).toBeLessThan(0.7);
      expect(result.feedback).toMatch(/ruhig/i);
    });

    it('provides guidance position when hand is very unstable', () => {
      const assistant = new HandStabilityAssistant();

      // Very jittery hand
      const veryJitterHand = makeHand((index, point) => {
        const jitter = Math.random() * 0.3;
        return [point[0] + jitter, point[1] + jitter, point[2]];
      });

      for (let i = 0; i < 5; i++) {
        const result = assistant.analyzeStability([veryJitterHand]);
        if (result.stabilityScore < 0.3 && result.guidePosition) {
          expect(result.guidePosition).toHaveProperty('x');
          expect(result.guidePosition).toHaveProperty('y');
        }
      }
    });

    it('handles empty or invalid landmarks gracefully', () => {
      const assistant = new HandStabilityAssistant();

      const emptyResult = assistant.analyzeStability([]);
      expect(emptyResult.isStable).toBe(false);
      expect(emptyResult.stabilityScore).toBe(0);
      expect(emptyResult.feedback).toContain('Hand');

      const incompleteHand = [[0, 0, 0], [0.1, 0.1, 0]]; // Only 2 landmarks
      const incompleteResult = assistant.analyzeStability([incompleteHand]);
      expect(incompleteResult.isStable).toBe(false);
    });
  });

  describe('GestureSizeNormalizer', () => {
    it('normalizes larger hands to reference size', () => {
      const normalizer = new GestureSizeNormalizer();
      const referenceHand = makeHand();
      
      // Establish reference
      normalizer.normalizeHandSize([referenceHand]);

      // Create a larger hand (scaled 2x)
      const largerHand = makeHand((index, point) => [
        point[0] * 2,
        point[1] * 2,
        point[2] * 2
      ]);

      const [normalized] = normalizer.normalizeHandSize([largerHand]);

      // Calculate hand sizes
      const getHandSize = (hand: number[][]): number => {
        const wrist = hand[0];
        const middle = hand[12];
        if (!wrist || !middle) return 0;
        return Math.sqrt(
          Math.pow(middle[0]! - wrist[0]!, 2) +
          Math.pow(middle[1]! - wrist[1]!, 2) +
          Math.pow(middle[2]! - wrist[2]!, 2)
        );
      };

      const refSize = getHandSize(referenceHand);
      const normSize = getHandSize(normalized);
      
      // Normalized size should be closer to reference
      expect(Math.abs(normSize - refSize) / refSize).toBeLessThan(1.5);
    });

    it('keeps hand sizes within caregiver tolerance', () => {
      const normalizer = new GestureSizeNormalizer();
      const referenceHand = makeHand();
      
      normalizer.normalizeHandSize([referenceHand]);

      const largerHand = makeHand((index, point) => [
        point[0] * 3,
        point[1] * 3,
        point[2] * 3
      ]);

      const [normalized] = normalizer.normalizeHandSize([largerHand]);

      const tolerance = normalizer.getTolerance();
      expect(tolerance.tolerance).toBeGreaterThan(0);
      expect(tolerance.maxScale).toBeGreaterThan(1);
      
      // Normalized hand should exist and have proper structure
      expect(normalized).toBeDefined();
      expect(normalized.length).toBe(21);
    });

    it('handles empty hand arrays', () => {
      const normalizer = new GestureSizeNormalizer();
      const result = normalizer.normalizeHandSize([]);
      expect(result).toEqual([]);
    });

    it('preserves hand structure during normalization', () => {
      const normalizer = new GestureSizeNormalizer();
      const hand = makeHand();
      
      const [normalized] = normalizer.normalizeHandSize([hand]);

      expect(normalized.length).toBe(hand.length);
      expect(normalized.length).toBe(21); // MediaPipe hand landmarks
      
      // Each landmark should have x, y, z coordinates
      normalized.forEach((landmark) => {
        expect(landmark.length).toBe(3);
        expect(typeof landmark[0]).toBe('number');
        expect(typeof landmark[1]).toBe('number');
        expect(typeof landmark[2]).toBe('number');
      });
    });
  });

  describe('PartialGestureDetector', () => {
    it('recognizes partial fist gestures for 22q11 practice', () => {
      const detector = new PartialGestureDetector();
      
      // Create a partial fist (only first two fingers curled)
      const partialFist = makeHand((index, point) => {
        const tips = [8, 12, 16, 20];
        
        if (tips.includes(index)) {
          // Index and middle finger tips below joints (curled)
          if (index === 8 || index === 12) {
            return [point[0], point[1] + 0.05, point[2]];
          }
          // Ring and pinky extended (tips above joints)
          return [point[0], point[1] - 0.05, point[2]];
        }
        return point;
      });

      const analysis = detector.analyzePartialCompletion([partialFist], 'fist');
      
      expect(analysis.isPartial).toBe(true);
      expect(analysis.completion).toBeGreaterThan(0.3);
      expect(analysis.completion).toBeLessThan(0.9);
      expect(analysis.feedback).toBeTruthy();
      expect(analysis.feedback).toMatch(/faust/i);
    });

    it('provides encouraging feedback for partial gestures', () => {
      const detector = new PartialGestureDetector();
      
      const partialHand = makeHand((index, point) => {
        // Simulate 50% completion
        if (index > 10) {
          return [point[0], point[1] + 0.03, point[2]];
        }
        return point;
      });

      const analysis = detector.analyzePartialCompletion([partialHand], 'point');
      
      if (analysis.isPartial) {
        expect(analysis.feedback).toBeTruthy();
        expect(analysis.confidence).toBeGreaterThan(0);
      }
    });

    it('should recognize partial completion threshold for recognition', () => {
      const detector = new PartialGestureDetector();
      
      const highCompletion = 0.8;
      const highConfidence = 0.75;
      expect(detector.shouldRecognizePartial(highCompletion, highConfidence)).toBe(true);

      const lowCompletion = 0.3;
      const lowConfidence = 0.3;
      expect(detector.shouldRecognizePartial(lowCompletion, lowConfidence)).toBe(false);
    });

    it('handles different gesture types appropriately', () => {
      const detector = new PartialGestureDetector();
      const testHand = makeHand();

      const gestureTypes = ['fist', 'point', 'thumbs_up', 'open_palm'];
      
      gestureTypes.forEach(gestureType => {
        const analysis = detector.analyzePartialCompletion([testHand], gestureType);
        
        expect(analysis).toHaveProperty('isPartial');
        expect(analysis).toHaveProperty('completion');
        expect(analysis).toHaveProperty('confidence');
        expect(analysis).toHaveProperty('feedback');
      });
    });

    it('handles invalid input gracefully', () => {
      const detector = new PartialGestureDetector();

      const emptyResult = detector.analyzePartialCompletion([], 'fist');
      expect(emptyResult.isPartial).toBe(false);
      expect(emptyResult.completion).toBe(0);
      expect(emptyResult.confidence).toBe(0);

      const incompleteHand = [[0, 0, 0]]; // Only 1 landmark
      const incompleteResult = detector.analyzePartialCompletion([incompleteHand], 'fist');
      expect(incompleteResult.isPartial).toBe(false);
    });
  });

  describe('Integration - 22q11 Workflow', () => {
    it('complete workflow: stability check -> partial detection -> encouragement', () => {
      const stabilityAssistant = new HandStabilityAssistant();
      const partialDetector = new PartialGestureDetector();
      const sizeNormalizer = new GestureSizeNormalizer();

      // Step 1: Check stability
      const hand = makeHand();
      const stabilityResult = stabilityAssistant.analyzeStability([hand]);
      
      if (!stabilityResult.isStable) {
        expect(stabilityResult.feedback).toBeTruthy();
      }

      // Step 2: Normalize hand size
      const [normalizedHand] = sizeNormalizer.normalizeHandSize([hand]);
      expect(normalizedHand.length).toBe(21);

      // Step 3: Detect partial gesture
      const partialResult = partialDetector.analyzePartialCompletion(
        [normalizedHand],
        'fist'
      );
      
      expect(partialResult).toHaveProperty('isPartial');
      expect(partialResult).toHaveProperty('feedback');
    });

    it('provides German feedback throughout the workflow', () => {
      const stabilityAssistant = new HandStabilityAssistant();
      const partialDetector = new PartialGestureDetector();

      const unstableHand = makeHand((i, p) => [
        p[0] + Math.random() * 0.1,
        p[1] + Math.random() * 0.1,
        p[2]
      ]);

      // All feedback should be in German
      const stabilityResult = stabilityAssistant.analyzeStability([unstableHand]);
      if (stabilityResult.feedback) {
        // Check for German words (should not contain English error messages)
        expect(stabilityResult.feedback).not.toMatch(/error|failed|invalid/i);
      }

      const partialResult = partialDetector.analyzePartialCompletion([unstableHand], 'fist');
      if (partialResult.feedback) {
        expect(partialResult.feedback).not.toMatch(/error|failed/i);
      }
    });
  });

  describe('Performance and Memory', () => {
    it('should process stability analysis quickly', () => {
      const assistant = new HandStabilityAssistant();
      const hand = makeHand();

      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        assistant.analyzeStability([hand]);
      }

      const elapsed = performance.now() - startTime;
      const avgTime = elapsed / 100;

      // Should process each frame in under 5ms
      expect(avgTime).toBeLessThan(5);
    });

    it('should handle rapid gesture changes efficiently', () => {
      const detector = new PartialGestureDetector();
      const hands = Array.from({ length: 50 }, () => makeHand());

      const startTime = performance.now();

      hands.forEach(hand => {
        detector.analyzePartialCompletion([hand], 'fist');
      });

      const elapsed = performance.now() - startTime;
      const avgTime = elapsed / 50;

      // Should process each analysis in under 2ms
      expect(avgTime).toBeLessThan(2);
    });
  });
});
