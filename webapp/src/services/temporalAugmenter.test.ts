/**
 * Tests for TemporalAugmenter - TDD approach for temporal speed variation
 * 
 * Research basis: "Multi-scale local-temporal similarity fusion for continuous sign language"
 * Amy First: Recognizes both slow/careful and fast/excited signing
 */

import { describe, it, expect } from 'vitest';
import { TemporalAugmenter } from './temporalAugmenter';
import type { GestureLandmarks } from '../gesture/core/types';

describe('TemporalAugmenter', () => {
  const createSampleLandmarks = (): GestureLandmarks => ({
    handLandmarks: [
      [
        { x: 0.5, y: 0.5, z: 0 },
        { x: 0.6, y: 0.6, z: 0.1 },
      ],
    ],
    handedness: ['Right'],
  });

  describe('Temporal Speed Modulation', () => {
    it('should generate slow variation (0.8x speed) for careful signing', () => {
      const augmenter = new TemporalAugmenter();
      const original = createSampleLandmarks();
      
      const slow = augmenter.modulateSpeed(original, 0.8);
      
      // Slower gestures have the same landmarks but different temporal metadata
      expect(slow.handLandmarks).toBeDefined();
      expect(slow.temporalScale).toBe(0.8);
      expect(slow.handLandmarks).toEqual(original.handLandmarks);
    });

    it('should generate normal variation (1.0x speed) as baseline', () => {
      const augmenter = new TemporalAugmenter();
      const original = createSampleLandmarks();
      
      const normal = augmenter.modulateSpeed(original, 1.0);
      
      expect(normal.temporalScale).toBe(1.0);
      expect(normal.handLandmarks).toEqual(original.handLandmarks);
    });

    it('should generate fast variation (1.2x speed) for excited signing', () => {
      const augmenter = new TemporalAugmenter();
      const original = createSampleLandmarks();
      
      const fast = augmenter.modulateSpeed(original, 1.2);
      
      expect(fast.temporalScale).toBe(1.2);
      expect(fast.handLandmarks).toEqual(original.handLandmarks);
    });
  });

  describe('Batch Augmentation', () => {
    it('should generate multiple speed variations for training', () => {
      const augmenter = new TemporalAugmenter();
      const original = createSampleLandmarks();
      
      const variations = augmenter.generateSpeedVariations(original);
      
      expect(variations).toHaveLength(3); // 0.8x, 1.0x, 1.2x
      expect(variations[0].temporalScale).toBe(0.8);
      expect(variations[1].temporalScale).toBe(1.0);
      expect(variations[2].temporalScale).toBe(1.2);
    });

    it('should preserve all landmark data across variations', () => {
      const augmenter = new TemporalAugmenter();
      const original = createSampleLandmarks();
      
      const variations = augmenter.generateSpeedVariations(original);
      
      variations.forEach(variation => {
        expect(variation.handLandmarks).toEqual(original.handLandmarks);
        expect(variation.handedness).toEqual(original.handedness);
      });
    });
  });

  describe('Integration with Training Pipeline', () => {
    it('should augment gesture samples for training bundle', () => {
      const augmenter = new TemporalAugmenter();
      const gestureSamples = [
        { symbol: 'HALLO', landmarks: createSampleLandmarks(), success: true },
        { symbol: 'DANKE', landmarks: createSampleLandmarks(), success: true },
      ];
      
      const augmented = augmenter.augmentTrainingSamples(gestureSamples);
      
      // Each sample should generate 3 variations
      expect(augmented.length).toBe(6); // 2 original × 3 speeds
      
      // Verify symbol preservation
      const halloVariations = augmented.filter(s => s.symbol === 'HALLO');
      expect(halloVariations).toHaveLength(3);
      
      const dankeVariations = augmented.filter(s => s.symbol === 'DANKE');
      expect(dankeVariations).toHaveLength(3);
    });

    it('should maintain success status across augmented samples', () => {
      const augmenter = new TemporalAugmenter();
      const gestureSamples = [
        { symbol: 'HALLO', landmarks: createSampleLandmarks(), success: true },
        { symbol: 'DANKE', landmarks: createSampleLandmarks(), success: false },
      ];
      
      const augmented = augmenter.augmentTrainingSamples(gestureSamples);
      
      augmented.forEach(sample => {
        const original = gestureSamples.find(s => s.symbol === sample.symbol);
        expect(sample.success).toBe(original?.success);
      });
    });

    it('should add temporal metadata for server-side training', () => {
      const augmenter = new TemporalAugmenter();
      const gestureSamples = [
        { symbol: 'HALLO', landmarks: createSampleLandmarks(), success: true },
      ];
      
      const augmented = augmenter.augmentTrainingSamples(gestureSamples);
      
      augmented.forEach(sample => {
        expect(sample.landmarks.temporalScale).toBeDefined();
        expect(sample.landmarks.temporalScale).toBeGreaterThan(0);
        expect(sample.metadata?.temporalAugmentation).toBe(true);
      });
    });
  });

  describe('Semantic Preservation', () => {
    it('should not alter spatial landmark positions', () => {
      const augmenter = new TemporalAugmenter();
      const original = createSampleLandmarks();
      const originalPositions = JSON.stringify(original.handLandmarks);
      
      const variations = augmenter.generateSpeedVariations(original);
      
      variations.forEach(variation => {
        const variationPositions = JSON.stringify(variation.handLandmarks);
        expect(variationPositions).toBe(originalPositions);
      });
    });

    it('should preserve handedness information', () => {
      const augmenter = new TemporalAugmenter();
      const original: GestureLandmarks = {
        ...createSampleLandmarks(),
        handedness: ['Left', 'Right'], // Two-handed gesture
      };
      
      const variations = augmenter.generateSpeedVariations(original);
      
      variations.forEach(variation => {
        expect(variation.handedness).toEqual(['Left', 'Right']);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty landmarks gracefully', () => {
      const augmenter = new TemporalAugmenter();
      const empty: GestureLandmarks = {
        handLandmarks: [],
        handedness: [],
      };
      
      const variations = augmenter.generateSpeedVariations(empty);
      
      expect(variations).toHaveLength(3);
      variations.forEach(v => {
        expect(v.handLandmarks).toEqual([]);
      });
    });

    it('should handle pose and face landmarks if present', () => {
      const augmenter = new TemporalAugmenter();
      const withPose: GestureLandmarks = {
        handLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]],
        handedness: ['Right'],
        poseLandmarks: [{ x: 0.5, y: 0.5, z: 0 }],
        faceLandmarks: [{ x: 0.5, y: 0.5, z: 0 }],
      };
      
      const variations = augmenter.generateSpeedVariations(withPose);
      
      variations.forEach(variation => {
        expect(variation.poseLandmarks).toEqual(withPose.poseLandmarks);
        expect(variation.faceLandmarks).toEqual(withPose.faceLandmarks);
      });
    });
  });
});
