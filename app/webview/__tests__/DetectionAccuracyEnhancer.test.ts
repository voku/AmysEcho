/**
 * Unit tests for DetectionAccuracyEnhancer
 * Tests conflict resolution and enhanced rule-based detection
 */

import { DetectionAccuracyEnhancer, DetectionResult, ConflictResolutionResult } from '../utils/DetectionAccuracyEnhancer';

describe('DetectionAccuracyEnhancer', () => {
  let enhancer: DetectionAccuracyEnhancer;

  beforeEach(() => {
    enhancer = new DetectionAccuracyEnhancer();
  });

  describe('conflict resolution', () => {
    it('should handle empty detection results', () => {
      const result = enhancer.resolveConflicts([]);

      expect(result.finalGesture).toBe('');
      expect(result.finalConfidence).toBe(0);
      expect(result.methodUsed).toBe('none');
      expect(result.reasoning).toContain('No detection results');
    });

    it('should return single result directly', () => {
      const singleResult: DetectionResult = {
        gesture: 'thumbs_up',
        confidence: 0.8,
        method: 'mediapipe'
      };

      const result = enhancer.resolveConflicts([singleResult]);

      expect(result.finalGesture).toBe('thumbs_up');
      expect(result.finalConfidence).toBe(0.8);
      expect(result.methodUsed).toBe('mediapipe');
      expect(result.alternatives).toHaveLength(0);
    });

    it('should resolve conflicts with clear high-confidence winner', () => {
      const results: DetectionResult[] = [
        { gesture: 'thumbs_up', confidence: 0.9, method: 'mediapipe' },
        { gesture: 'open_palm', confidence: 0.6, method: 'rule_based' },
        { gesture: 'fist', confidence: 0.4, method: 'partial' }
      ];

      const result = enhancer.resolveConflicts(results);

      expect(result.finalGesture).toBe('thumbs_up');
      expect(result.finalConfidence).toBe(0.9);
      expect(result.methodUsed).toBe('mediapipe');
      expect(result.reasoning).toContain('Clear high-confidence result');
    });

    it('should use method priority as tiebreaker', () => {
      const results: DetectionResult[] = [
        { gesture: 'thumbs_up', confidence: 0.7, method: 'rule_based' },
        { gesture: 'thumbs_up', confidence: 0.7, method: 'mediapipe' },
        { gesture: 'open_palm', confidence: 0.6, method: 'mlp' }
      ];

      const result = enhancer.resolveConflicts(results);

      expect(result.finalGesture).toBe('thumbs_up');
      expect(result.finalConfidence).toBe(0.7);
      expect(result.methodUsed).toBe('mediapipe'); // Higher priority method
      expect(result.reasoning).toContain('Method priority tiebreaker');
    });

    it('should apply historical consistency bonus', () => {
      // First, build some history
      const historicalResults: DetectionResult[] = [
        { gesture: 'thumbs_up', confidence: 0.8, method: 'mediapipe' },
        { gesture: 'thumbs_up', confidence: 0.9, method: 'mediapipe' }
      ];

      enhancer.resolveConflicts(historicalResults);

      // Now test with lower confidence but same gesture
      const currentResults: DetectionResult[] = [
        { gesture: 'thumbs_up', confidence: 0.5, method: 'rule_based' },
        { gesture: 'open_palm', confidence: 0.6, method: 'mlp' }
      ];

      const result = enhancer.resolveConflicts(currentResults);

      expect(result.finalGesture).toBe('thumbs_up');
      expect(result.finalConfidence).toBeGreaterThan(0.5); // Should get historical bonus
      expect(result.reasoning).toContain('Historical consistency bonus');
    });
  });

  describe('enhanced rule-based detection', () => {
    // Mock dependencies
    const mockTremorCompensator = {
      smoothLandmarks: jest.fn((landmarks) => landmarks)
    };

    const mockSizeNormalizer = {
      normalizeHandSize: jest.fn((landmarks) => landmarks)
    };

    const mockPartialDetector = {
      analyzePartialCompletion: jest.fn()
    };

    beforeEach(() => {
      mockTremorCompensator.smoothLandmarks.mockClear();
      mockSizeNormalizer.normalizeHandSize.mockClear();
      mockPartialDetector.analyzePartialCompletion.mockClear();
    });

    it('should handle empty landmarks', () => {
      const results = enhancer.enhanceRuleBasedDetection(
        [],
        mockTremorCompensator as any,
        mockSizeNormalizer as any,
        mockPartialDetector as any
      );

      expect(results).toHaveLength(0);
    });

    it('should preprocess landmarks correctly', () => {
      const landmarks = [[[0.1, 0.1, 0.0], [0.2, 0.2, 0.0]]];

      enhancer.enhanceRuleBasedDetection(
        landmarks,
        mockTremorCompensator as any,
        mockSizeNormalizer as any,
        mockPartialDetector as any
      );

      expect(mockTremorCompensator.smoothLandmarks).toHaveBeenCalledWith(landmarks);
      expect(mockSizeNormalizer.normalizeHandSize).toHaveBeenCalled();
    });

    it('should detect thumbs up gesture', () => {
      // Create hand landmarks for thumbs up: thumb extended, others curled
      const landmarks = [
        [
          [0.0, 0.0, 0.0], // wrist
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], [0.0, -0.15, 0.0], // thumb (extended)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // index (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // middle (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // ring (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // pinky (curled)
        ]
      ];

      const results = enhancer.enhanceRuleBasedDetection(
        landmarks,
        mockTremorCompensator as any,
        mockSizeNormalizer as any,
        mockPartialDetector as any
      );

      const thumbsUpResult = results.find(r => r.gesture === 'thumbs_up');
      expect(thumbsUpResult).toBeDefined();
      expect(thumbsUpResult!.confidence).toBeGreaterThan(0.3);
      expect(thumbsUpResult!.method).toBe('rule_based');
    });

    it('should detect open palm gesture', () => {
      // Create hand landmarks for open palm: all fingers extended
      const landmarks = [
        [
          [0.0, 0.0, 0.0], // wrist
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], [0.0, -0.15, 0.0], // thumb (extended)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], [0.0, -0.1, 0.0], // index (extended)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], [0.0, -0.1, 0.0], // middle (extended)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], [0.0, -0.1, 0.0], // ring (extended)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], [0.0, -0.1, 0.0], // pinky (extended)
        ]
      ];

      const results = enhancer.enhanceRuleBasedDetection(
        landmarks,
        mockTremorCompensator as any,
        mockSizeNormalizer as any,
        mockPartialDetector as any
      );

      const openPalmResult = results.find(r => r.gesture === 'open_palm');
      expect(openPalmResult).toBeDefined();
      expect(openPalmResult!.confidence).toBeGreaterThan(0.3);
      expect(openPalmResult!.method).toBe('rule_based');
    });

    it('should detect fist gesture', () => {
      // Create hand landmarks for fist: all fingers curled
      const landmarks = [
        [
          [0.0, 0.0, 0.0], // wrist
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.12, 0.0], // thumb (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // index (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // middle (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // ring (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // pinky (curled)
        ]
      ];

      const results = enhancer.enhanceRuleBasedDetection(
        landmarks,
        mockTremorCompensator as any,
        mockSizeNormalizer as any,
        mockPartialDetector as any
      );

      const fistResult = results.find(r => r.gesture === 'fist');
      expect(fistResult).toBeDefined();
      expect(fistResult!.confidence).toBeGreaterThan(0.3);
      expect(fistResult!.method).toBe('rule_based');
    });

    it('should include partial gesture analysis', () => {
      const landmarks = [[[0.1, 0.1, 0.0]]];

      mockPartialDetector.analyzePartialCompletion.mockReturnValue({
        isPartial: true,
        completion: 0.7,
        confidence: 0.6,
        feedback: 'Almost there!'
      });

      const results = enhancer.enhanceRuleBasedDetection(
        landmarks,
        mockTremorCompensator as any,
        mockSizeNormalizer as any,
        mockPartialDetector as any
      );

      const partialResults = results.filter(r => r.method === 'partial');
      expect(partialResults.length).toBeGreaterThan(0);
      expect(mockPartialDetector.analyzePartialCompletion).toHaveBeenCalled();
    });

    it('should rank results by confidence and method priority', () => {
      const landmarks = [
        [
          [0.0, 0.0, 0.0], // wrist
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], // thumb (extended)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // index (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // middle (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // ring (curled)
          [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // pinky (curled)
        ]
      ];

      const results = enhancer.enhanceRuleBasedDetection(
        landmarks,
        mockTremorCompensator as any,
        mockSizeNormalizer as any,
        mockPartialDetector as any
      );

      // Results should be sorted by confidence (highest first)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].confidence).toBeGreaterThanOrEqual(results[i + 1].confidence);
      }
    });
  });

  describe('accuracy statistics', () => {
    it('should provide accuracy statistics', () => {
      // Build some history
      const results: DetectionResult[] = [
        { gesture: 'thumbs_up', confidence: 0.8, method: 'mediapipe' },
        { gesture: 'thumbs_up', confidence: 0.9, method: 'mediapipe' },
        { gesture: 'open_palm', confidence: 0.7, method: 'rule_based' }
      ];

      enhancer.resolveConflicts(results);

      const stats = enhancer.getAccuracyStats();

      expect(stats.totalGestures).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.averageCandidateConfidence).toBeGreaterThan(0);
      expect(stats.averageFinalConfidence).toBeGreaterThan(0);
      expect(stats.historicalConfidence).toHaveProperty('thumbs_up');
      expect(stats.historicalConfidence).not.toHaveProperty('open_palm');
    });

    it('should reset accuracy tracking', () => {
      const results: DetectionResult[] = [
        { gesture: 'thumbs_up', confidence: 0.8, method: 'mediapipe' }
      ];

      enhancer.resolveConflicts(results);
      expect(enhancer.getAccuracyStats().totalGestures).toBeGreaterThan(0);

      enhancer.reset();
      const resetStats = enhancer.getAccuracyStats();
      expect(resetStats.totalGestures).toBe(0);
      expect(resetStats.averageConfidence).toBe(0);
      expect(resetStats.averageCandidateConfidence).toBe(0);
      expect(resetStats.averageFinalConfidence).toBe(0);
    });
  });

  describe('finger state analysis', () => {
    it('should correctly analyze finger states', () => {
      const hand = [
        [0.0, 0.0, 0.0], // wrist
        [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], // thumb extended
        [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // index curled
        [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, -0.1, 0.0], [0.0, -0.1, 0.0], // middle extended
        [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // ring curled
        [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.1, 0.0], // pinky curled
      ];

      // Access private method for testing (using type assertion)
      const fingerStates = (enhancer as any).analyzeFingerStates(hand);

      expect(fingerStates.thumb).toBe('extended');
      expect(fingerStates.index).toBe('curled');
      expect(fingerStates.middle).toBe('extended');
      expect(fingerStates.ring).toBe('curled');
      expect(fingerStates.pinky).toBe('curled');
    });
  });

  describe('edge cases', () => {
    it('should handle insufficient landmarks gracefully', () => {
      const landmarks = [Array(10).fill([0.0, 0.0, 0.0])]; // Insufficient landmarks

      const results = enhancer.enhanceRuleBasedDetection(
        landmarks,
        undefined,
        undefined,
        undefined
      );

      expect(results).toHaveLength(0);
    });

    it('should handle malformed landmarks', () => {
      const landmarks = [[[null, null, null]]]; // Malformed landmarks

      const results = enhancer.enhanceRuleBasedDetection(
        landmarks,
        undefined,
        undefined,
        undefined
      );

      // Should not crash, may return empty or minimal results
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle very low confidence results', () => {
      const results: DetectionResult[] = [
        { gesture: 'thumbs_up', confidence: 0.1, method: 'rule_based' },
        { gesture: 'open_palm', confidence: 0.05, method: 'partial' }
      ];

      const resolution = enhancer.resolveConflicts(results);

      // Should still pick the highest confidence result
      expect(resolution.finalGesture).toBe('thumbs_up');
      expect(resolution.finalConfidence).toBe(0.1);
    });
  });
});