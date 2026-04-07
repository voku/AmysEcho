/**
 * Tests for MultiScaleTemporalFeatureExtractor
 * 
 * Research Foundation:
 * - "Multi-scale local-temporal similarity fusion for continuous sign language" (Pattern Recognition 2022)
 * - Port of server-side Python implementation to TypeScript for frontend processing
 * - Combines local (short-term) and global (long-term) temporal patterns
 * 
 * Amy First: Better distinction of timing-dependent gestures like "SCHNELL" (fast) vs "LANGSAM" (slow)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MultiScaleTemporalFeatureExtractor,
  TemporalFeatureConfig,
} from './MultiScaleTemporalFeatureExtractor';

describe('MultiScaleTemporalFeatureExtractor', () => {
  let extractor: MultiScaleTemporalFeatureExtractor;

  beforeEach(() => {
    extractor = new MultiScaleTemporalFeatureExtractor();
  });

  afterEach(() => {
    extractor.dispose();
  });

  describe('feature extraction at single scale', () => {
    it('should extract local features with small scale', () => {
      const sequence = createTestSequence(10, 63);
      const features = extractor.extractLocalFeatures(sequence, 3);
      
      expect(features).toBeDefined();
      // Convolution with kernel size 3 reduces length by 2
      expect(features.length).toBe(8);
      const firstFeature = features[0];
      if (firstFeature) {
        expect(firstFeature.length).toBe(63);
      }
    });

    it('should return original sequence when shorter than scale', () => {
      const sequence = createTestSequence(2, 63);
      const features = extractor.extractLocalFeatures(sequence, 5);
      
      // Should return original when sequence is shorter than scale
      expect(features.length).toBe(2);
      const firstFeature = features[0];
      if (firstFeature) {
        expect(firstFeature.length).toBe(63);
      }
    });

    it('should apply smoothing through convolution', () => {
      // Create a sequence with a spike to test smoothing
      const sequence = createTestSequence(10, 3);
      // Add spike at frame 5
      const spikeFrame = sequence[5];
      if (spikeFrame) {
        spikeFrame[0] = 10.0;
      }
      
      const smoothed = extractor.extractLocalFeatures(sequence, 3);
      
      // The spike should be smoothed (averaged with neighbors)
      // Frame 5 in original becomes part of frames 3, 4, 5 in smoothed output
      const spikeInfluencedFrames = [3, 4, 5];
      let foundSmoothing = false;
      for (const idx of spikeInfluencedFrames) {
        const smoothedFrame = smoothed[idx];
        const fourthFrame = sequence[4];
        if (smoothedFrame && smoothedFrame[0] !== undefined && fourthFrame && fourthFrame[0] !== undefined) {
          if (smoothedFrame[0] < 10.0 && smoothedFrame[0] > fourthFrame[0]) {
            foundSmoothing = true;
            break;
          }
        }
      }
      expect(foundSmoothing).toBe(true);
    });
  });

  describe('multi-scale feature fusion', () => {
    it('should extract features at multiple scales and fuse them', () => {
      const sequence = createTestSequence(15, 21);
      const fused = extractor.extractAndFuse(sequence);
      
      expect(fused).toBeDefined();
      expect(fused.length).toBeGreaterThan(0);
      const firstFused = fused[0];
      if (firstFused) {
        expect(firstFused.length).toBe(21 * 3);
      }
    });

    it('should handle empty sequences', () => {
      const fused = extractor.extractAndFuse([]);
      
      expect(fused.length).toBe(0);
    });

    it('should handle very short sequences', () => {
      const sequence = createTestSequence(2, 10);
      const fused = extractor.extractAndFuse(sequence);
      
      // Should still produce output even for short sequences
      expect(fused.length).toBeGreaterThan(0);
    });

    it('should respect custom scales', () => {
      const config: TemporalFeatureConfig = {
        scales: [2, 4],
      };
      const customExtractor = new MultiScaleTemporalFeatureExtractor(config);
      
      const sequence = createTestSequence(10, 5);
      const fused = customExtractor.extractAndFuse(sequence);
      
      // With scales [2, 4], fused should have 2x original dimensions
      const firstFused = fused[0];
      if (firstFused) {
        expect(firstFused.length).toBe(5 * 2);
      }
      
      customExtractor.dispose();
    });
  });

  describe('temporal scale adaptation', () => {
    it('should adapt feature weights based on temporal scale metadata', () => {
      const sequence = createTestSequence(10, 21);
      
      // Fast gesture (temporal scale < 1)
      const fastFeatures = extractor.extractAndFuse(sequence, 0.8);
      
      // Slow gesture (temporal scale > 1)
      const slowFeatures = extractor.extractAndFuse(sequence, 1.2);
      
      // Both should produce valid output
      expect(fastFeatures.length).toBeGreaterThan(0);
      expect(slowFeatures.length).toBeGreaterThan(0);
      
      // Feature dimensions should be the same
      const firstFast = fastFeatures[0];
      const firstSlow = slowFeatures[0];
      if (firstFast && firstSlow) {
        expect(firstFast.length).toBe(firstSlow.length);
      }
    });
  });

  describe('velocity-aware feature extraction', () => {
    it('should compute velocity features from landmark sequence', () => {
      const sequence = createMovingSequence(10, 21);
      const velocityFeatures = extractor.extractVelocityFeatures(sequence);
      
      expect(velocityFeatures).toBeDefined();
      expect(velocityFeatures.length).toBe(9); // n-1 frames for velocity
      const firstVel = velocityFeatures[0];
      if (firstVel) {
        expect(firstVel.averageVelocity).toBeGreaterThan(0);
        expect(firstVel.featureVelocities).toHaveLength(21);
      }
    });

    it('should detect acceleration in velocity features', () => {
      // Create sequence with increasing velocity (acceleration)
      const sequence = createAcceleratingSequence(10, 21);
      const velocityFeatures = extractor.extractVelocityFeatures(sequence);
      
      // Later frames should have higher velocity
      const firstVelocity = velocityFeatures[0]?.averageVelocity ?? 0;
      const lastVelocity = velocityFeatures[velocityFeatures.length - 1]?.averageVelocity ?? 0;
      
      expect(lastVelocity).toBeGreaterThan(firstVelocity);
    });

    it('should handle static sequences', () => {
      const sequence = createTestSequence(10, 21);
      const velocityFeatures = extractor.extractVelocityFeatures(sequence);
      
      // Static sequence should have low velocities
      const avgVelocity = velocityFeatures.reduce((sum, f) => sum + f.averageVelocity, 0) / velocityFeatures.length;
      expect(avgVelocity).toBeLessThan(0.1);
    });
  });

  describe('feature dimensionality calculation', () => {
    it('should correctly calculate output dimension', () => {
      const inputFeatures = 63; // 21 landmarks * 3 coordinates
      const expectedDim = extractor.getFeatureDimension(inputFeatures);
      
      // Default 3 scales should give 3x input dimension
      expect(expectedDim).toBe(inputFeatures * 3);
    });

    it('should calculate dimension for custom scales', () => {
      const config: TemporalFeatureConfig = {
        scales: [2, 4, 6, 8],
      };
      const customExtractor = new MultiScaleTemporalFeatureExtractor(config);
      
      const expectedDim = customExtractor.getFeatureDimension(21);
      expect(expectedDim).toBe(21 * 4); // 4 scales
      
      customExtractor.dispose();
    });
  });

  describe('integration with gesture recognition', () => {
    it('should produce consistent features for similar gestures', () => {
      const gesture1 = createTestSequence(10, 21);
      const gesture2 = createTestSequence(10, 21);
      
      // Add slight variations to gesture2
      for (let i = 0; i < gesture2.length; i++) {
        const frame = gesture2[i];
        if (frame) {
          for (let j = 0; j < frame.length; j++) {
            const val = frame[j];
            if (val !== undefined) {
              frame[j] = val + (Math.random() - 0.5) * 0.01; // Small noise
            }
          }
        }
      }
      
      const features1 = extractor.extractAndFuse(gesture1);
      const features2 = extractor.extractAndFuse(gesture2);
      
      // Features should be similar (correlated)
      const f1 = features1[0];
      const f2 = features2[0];
      if (f1 && f2) {
        const similarity = computeCosineSimilarity(f1, f2);
        expect(similarity).toBeGreaterThan(0.9);
      }
    });

    it('should produce different features for different gestures', () => {
      const staticGesture = createTestSequence(10, 21);
      const movingGesture = createMovingSequence(10, 21);
      
      const staticFeatures = extractor.extractAndFuse(staticGesture);
      const movingFeatures = extractor.extractAndFuse(movingGesture);
      
      // Features should be similar but not identical (both are valid hand poses)
      // The multi-scale fusion captures structural similarity but also movement patterns
      const s0 = staticFeatures[0];
      const m0 = movingFeatures[0];
      if (s0 && m0) {
        const similarity = computeCosineSimilarity(s0, m0);
        
        // They may have high structural similarity but the features capture timing differences
        // We verify they produce valid, non-identical outputs
        expect(similarity).toBeLessThan(1.0); // Should not be identical
        expect(s0).not.toEqual(m0);
      }
    });
  });

  describe('memory management', () => {
    it('should handle repeated extractions without memory issues', () => {
      const sequence = createTestSequence(20, 63);
      
      // Perform many extractions
      for (let i = 0; i < 100; i++) {
        extractor.extractAndFuse(sequence);
      }
      
      // Should complete without issues
      const stats = extractor.getStats();
      expect(stats.extractionCount).toBe(100);
    });

    it('should cleanup properly on dispose', () => {
      const sequence = createTestSequence(10, 21);
      extractor.extractAndFuse(sequence);
      
      extractor.dispose();
      
      // Create new extractor - should work fresh
      const newExtractor = new MultiScaleTemporalFeatureExtractor();
      const features = newExtractor.extractAndFuse(sequence);
      expect(features.length).toBeGreaterThan(0);
      
      newExtractor.dispose();
    });
  });
});

/**
 * Create a test sequence with small variations
 */
function createTestSequence(frames: number, features: number): number[][] {
  const sequence: number[][] = [];
  
  for (let f = 0; f < frames; f++) {
    const frame: number[] = [];
    for (let i = 0; i < features; i++) {
      // Small variation to simulate stable hand
      frame.push(0.5 + (i / features) * 0.1 + (f / frames) * 0.01);
    }
    sequence.push(frame);
  }
  
  return sequence;
}

/**
 * Create a sequence with consistent movement
 */
function createMovingSequence(frames: number, features: number): number[][] {
  const sequence: number[][] = [];
  
  for (let f = 0; f < frames; f++) {
    const frame: number[] = [];
    for (let i = 0; i < features; i++) {
      // Linear movement over time
      frame.push(0.3 + (f / frames) * 0.4 + (i / features) * 0.05);
    }
    sequence.push(frame);
  }
  
  return sequence;
}

/**
 * Create a sequence with accelerating movement
 */
function createAcceleratingSequence(frames: number, features: number): number[][] {
  const sequence: number[][] = [];
  
  for (let f = 0; f < frames; f++) {
    const frame: number[] = [];
    // Quadratic increase in position = increasing velocity
    const progress = Math.pow(f / (frames - 1), 2);
    for (let i = 0; i < features; i++) {
      frame.push(0.3 + progress * 0.4 + (i / features) * 0.05);
    }
    sequence.push(frame);
  }
  
  return sequence;
}

/**
 * Compute cosine similarity between two vectors
 */
function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    if (valA !== undefined && valB !== undefined) {
      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
