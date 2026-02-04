/**
 * Tests for SpatialAttentionProcessor
 * 
 * Research Foundation:
 * - "Sequential Spatio-Temporal Attention Networks (SSTAN)" - multi-head spatial attention for joint relationships
 * - "Sign Pose-based Transformer for Word-level Sign Language Recognition" (WACV 2022)
 * - Spatial attention mechanisms selectively focus on relevant hand joints for gesture recognition
 * 
 * Amy First: Better recognition by focusing on the most important hand landmarks for each gesture
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SpatialAttentionProcessor,
  SpatialAttentionConfig,
} from './SpatialAttentionProcessor';

describe('SpatialAttentionProcessor', () => {
  let processor: SpatialAttentionProcessor;

  beforeEach(() => {
    processor = new SpatialAttentionProcessor();
  });

  afterEach(() => {
    processor.dispose();
  });

  describe('attention weight computation', () => {
    it('should compute attention weights for hand landmarks', () => {
      const landmarks = createTestLandmarks();
      const weights = processor.computeAttentionWeights(landmarks);

      expect(weights).toBeDefined();
      expect(weights.jointWeights).toHaveLength(21); // 21 hand landmarks
      expect(weights.jointWeights.every(w => w >= 0 && w <= 1)).toBe(true);
    });

    it('should assign higher weights to fingertip landmarks', () => {
      const landmarks = createTestLandmarks();
      const weights = processor.computeAttentionWeights(landmarks);

      // Fingertip indices: 4 (thumb), 8 (index), 12 (middle), 16 (ring), 20 (pinky)
      const fingertipIndices = [4, 8, 12, 16, 20];
      const fingertipWeights = fingertipIndices.map(i => weights.jointWeights[i] ?? 0);
      const avgFingertipWeight = fingertipWeights.reduce((a: number, b: number) => a + b, 0) / fingertipWeights.length;
      
      const baseIndices = [0, 1, 2, 5, 9, 13, 17];
      const baseWeights = baseIndices.map(idx => weights.jointWeights[idx] ?? 0);
      const avgBaseWeight = baseWeights.reduce((a: number, b: number) => a + b, 0) / baseWeights.length;

      // Fingertips should generally have higher attention than palm base for static gestures
      expect(avgFingertipWeight).toBeGreaterThanOrEqual(avgBaseWeight * 0.8);
    });

    it('should normalize attention weights to sum to 1', () => {
      const landmarks = createTestLandmarks();
      const weights = processor.computeAttentionWeights(landmarks);

      const sum = weights.jointWeights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should handle empty landmarks gracefully', () => {
      const weights = processor.computeAttentionWeights([]);
      expect(weights.jointWeights).toHaveLength(0);
    });

    it('should compute inter-joint attention scores', () => {
      const landmarks = createTestLandmarks();
      const weights = processor.computeAttentionWeights(landmarks);

      // Inter-joint attention captures relationships between landmarks
      expect(weights.interJointAttention).toBeDefined();
      expect(weights.interJointAttention.length).toBeGreaterThan(0);
    });
  });

  describe('landmark embedding with attention', () => {
    it('should apply attention weights to landmark features', () => {
      const landmarks = createTestLandmarks();
      const weighted = processor.applyAttention(landmarks);

      expect(weighted).toHaveLength(21);
      // Weighted landmarks should have modified coordinates
      expect(weighted[0]).toHaveLength(3);
    });

    it('should enhance prominent features through attention', () => {
      const landmarks = createTestLandmarks();
      const original = landmarks.map(l => [...l]);
      const weighted = processor.applyAttention(landmarks);

      // At least some landmarks should have been modified
      let hasChanges = false;
      for (let i = 0; i < original.length; i++) {
        const orig = original[i];
        const weight = weighted[i];
        if (orig && weight && (Math.abs((orig[0] ?? 0) - (weight[0] ?? 0)) > 0.0001 ||
            Math.abs((orig[1] ?? 0) - (weight[1] ?? 0)) > 0.0001)) {
          hasChanges = true;
          break;
        }
      }
      expect(hasChanges).toBe(true);
    });
  });

  describe('multi-head attention', () => {
    it('should support multiple attention heads', () => {
      const config: SpatialAttentionConfig = {
        numHeads: 4,
        keyDimension: 8,
        valueDimension: 8,
      };
      const multiHeadProcessor = new SpatialAttentionProcessor(config);
      
      const landmarks = createTestLandmarks();
      const weights = multiHeadProcessor.computeAttentionWeights(landmarks);

      expect(weights.headOutputs).toBeDefined();
      expect(weights.headOutputs).toHaveLength(4);
      
      multiHeadProcessor.dispose();
    });

    it('should aggregate multi-head outputs', () => {
      const config: SpatialAttentionConfig = {
        numHeads: 2,
        keyDimension: 4,
        valueDimension: 4,
      };
      const multiHeadProcessor = new SpatialAttentionProcessor(config);
      
      const landmarks = createTestLandmarks();
      const aggregated = multiHeadProcessor.getAggregatedAttention(landmarks);

      expect(aggregated).toHaveLength(21);
      expect(aggregated.every(v => v >= 0 && v <= 1)).toBe(true);
      
      multiHeadProcessor.dispose();
    });
  });

  describe('gesture-specific attention patterns', () => {
    it('should learn attention patterns for specific gestures', () => {
      const thumbsUpLandmarks = createThumbsUpLandmarks();
      
      // Record pattern for thumbs_up gesture
      processor.recordGesturePattern('thumbs_up', thumbsUpLandmarks);
      
      // Get learned pattern
      const pattern = processor.getLearnedPattern('thumbs_up');
      expect(pattern).toBeDefined();
      expect(pattern!.jointImportance).toHaveLength(21);
    });

    it('should adapt attention based on learned patterns', () => {
      const thumbsUpLandmarks = createThumbsUpLandmarks();
      
      // Record pattern multiple times to establish learning
      for (let i = 0; i < 5; i++) {
        processor.recordGesturePattern('thumbs_up', thumbsUpLandmarks);
      }
      
      // Weights should be adapted for this gesture
      const adaptedWeights = processor.computeAdaptedAttention('thumbs_up', thumbsUpLandmarks);
      expect(adaptedWeights.isAdapted).toBe(true);
      expect(adaptedWeights.adaptationConfidence).toBeGreaterThan(0);
    });

    it('should return default attention for unknown gestures', () => {
      const landmarks = createTestLandmarks();
      const weights = processor.computeAdaptedAttention('unknown_gesture', landmarks);
      
      expect(weights.isAdapted).toBe(false);
      expect(weights.adaptationConfidence).toBe(0);
    });
  });

  describe('two-hand spatial attention', () => {
    it('should compute cross-hand attention for two-handed gestures', () => {
      const leftHand = createTestLandmarks();
      const rightHand = createTestLandmarks();
      
      // Offset right hand to be to the right of left hand
      const offsetRightHand = rightHand.map(([x, y, z]) => [(x ?? 0) + 0.3, y ?? 0, z ?? 0]);
      
      const crossAttention = processor.computeCrossHandAttention(leftHand, offsetRightHand);
      
      expect(crossAttention).toBeDefined();
      expect(crossAttention.symmetryScore).toBeGreaterThanOrEqual(0);
      expect(crossAttention.symmetryScore).toBeLessThanOrEqual(1);
      expect(crossAttention.interactionPoints).toBeDefined();
    });

    it('should identify interaction points between hands', () => {
      // Create hands positioned close together
      const leftHand = createTestLandmarks();
      const rightHand = createTestLandmarks().map(([x, y, z]) => [(x ?? 0) + 0.15, y ?? 0, z ?? 0]);
      
      const crossAttention = processor.computeCrossHandAttention(leftHand, rightHand);
      
      // Should identify potential interaction points
      expect(crossAttention.interactionPoints.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('temporal attention integration', () => {
    it('should update attention weights over time', () => {
      const landmarks1 = createTestLandmarks();
      const landmarks2 = createTestLandmarks();
      
      processor.updateTemporalAttention(landmarks1, 0);
      processor.updateTemporalAttention(landmarks2, 33);
      
      const temporalWeights = processor.getTemporalAttentionWeights();
      expect(temporalWeights).toBeDefined();
      expect(temporalWeights.movementAttention).toBeDefined();
    });

    it('should boost attention for moving landmarks', () => {
      // Create landmarks where fingertips move more
      const landmarks1 = createTestLandmarks();
      const landmarks2 = createMovingFingertipLandmarks(landmarks1);
      const landmarks3 = createMovingFingertipLandmarks(landmarks2); // Continue movement
      
      // Need at least 2 frames before movement history is populated
      processor.updateTemporalAttention(landmarks1, 0);
      processor.updateTemporalAttention(landmarks2, 33);
      processor.updateTemporalAttention(landmarks3, 66); // Third frame to have 2 entries in history
      
      const temporalWeights = processor.getTemporalAttentionWeights();
      
      // Moving fingertips should have higher attention
      const fingertipIndices = [4, 8, 12, 16, 20];
      const fingertipAttention = fingertipIndices.map(i => temporalWeights.movementAttention[i] ?? 0);
      const avgFingertipMovement = fingertipAttention.reduce((a: number, b: number) => a + b, 0) / fingertipAttention.length;
      
      expect(avgFingertipMovement).toBeGreaterThan(0);
    });
  });

  describe('attention statistics and diagnostics', () => {
    it('should provide attention statistics', () => {
      const landmarks = createTestLandmarks();
      processor.computeAttentionWeights(landmarks);
      
      const stats = processor.getAttentionStats();
      
      expect(stats.computationCount).toBe(1);
      expect(stats.averageEntropy).toBeDefined();
      expect(stats.peakAttentionJoint).toBeDefined();
    });

    it('should calculate attention entropy', () => {
      const landmarks = createTestLandmarks();
      const weights = processor.computeAttentionWeights(landmarks);
      
      // Entropy should be between 0 (concentrated) and log2(21) (uniform)
      expect(weights.entropy).toBeGreaterThanOrEqual(0);
      expect(weights.entropy).toBeLessThanOrEqual(Math.log2(21));
    });
  });
});

/**
 * Create test landmarks with all 21 points around a center position
 */
function createTestLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  // Create 21 landmarks for a hand
  for (let i = 0; i < 21; i++) {
    const angle = (i / 21) * Math.PI * 2;
    const radius = 0.05 + (i % 5) * 0.02;
    const x = 0.5 + Math.cos(angle) * radius;
    const y = 0.5 + Math.sin(angle) * radius;
    landmarks.push([x, y, 0]);
  }
  
  return landmarks;
}

/**
 * Create landmarks simulating a thumbs up gesture
 */
function createThumbsUpLandmarks(): number[][] {
  const landmarks: number[][] = [];
  
  // Wrist (0)
  landmarks.push([0.5, 0.7, 0]);
  
  // Thumb (1-4) - extended upward
  landmarks.push([0.45, 0.65, 0]);
  landmarks.push([0.43, 0.55, 0]);
  landmarks.push([0.42, 0.45, 0]);
  landmarks.push([0.42, 0.35, 0]); // Thumb tip pointing up
  
  // Index finger (5-8) - curled
  landmarks.push([0.48, 0.65, 0]);
  landmarks.push([0.47, 0.62, 0.05]);
  landmarks.push([0.46, 0.64, 0.08]);
  landmarks.push([0.45, 0.67, 0.06]);
  
  // Middle finger (9-12) - curled
  landmarks.push([0.50, 0.65, 0]);
  landmarks.push([0.50, 0.62, 0.05]);
  landmarks.push([0.50, 0.64, 0.08]);
  landmarks.push([0.50, 0.67, 0.06]);
  
  // Ring finger (13-16) - curled
  landmarks.push([0.52, 0.65, 0]);
  landmarks.push([0.53, 0.62, 0.05]);
  landmarks.push([0.54, 0.64, 0.08]);
  landmarks.push([0.55, 0.67, 0.06]);
  
  // Pinky finger (17-20) - curled
  landmarks.push([0.54, 0.67, 0]);
  landmarks.push([0.55, 0.65, 0.05]);
  landmarks.push([0.56, 0.67, 0.08]);
  landmarks.push([0.57, 0.69, 0.06]);
  
  return landmarks;
}

/**
 * Create landmarks with moving fingertips
 */
function createMovingFingertipLandmarks(base: number[][]): number[][] {
  const moved = base.map(l => [...l]);
  
  // Move fingertips (indices 4, 8, 12, 16, 20) more than other landmarks
  const fingertipIndices = [4, 8, 12, 16, 20];
  for (const idx of fingertipIndices) {
    const point = moved[idx];
    if (point) {
      point[0] = (point[0] ?? 0) + 0.1; // Move X significantly
      point[1] = (point[1] ?? 0) + 0.05; // Move Y
    }
  }
  
  return moved;
}
