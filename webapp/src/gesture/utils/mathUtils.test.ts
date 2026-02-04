/**
 * Tests for shared Math Utilities
 *
 * Amy First: Verify consistent math operations across gesture processing components
 */

import { describe, it, expect } from 'vitest';
import {
  euclideanDistance,
  calculate3DHandSymmetry,
  normalizeVector,
  HAND_LANDMARK_INDICES,
  FINGERTIP_INDICES,
  MCP_INDICES,
  NUM_HAND_LANDMARKS,
} from './mathUtils';

describe('mathUtils', () => {
  describe('euclideanDistance', () => {
    it('should calculate distance between 3D points', () => {
      const p1 = [0, 0, 0];
      const p2 = [3, 4, 0];
      
      expect(euclideanDistance(p1, p2)).toBe(5);
    });

    it('should handle 3D distance correctly', () => {
      const p1 = [0, 0, 0];
      const p2 = [1, 1, 1];
      
      expect(euclideanDistance(p1, p2)).toBeCloseTo(Math.sqrt(3), 5);
    });

    it('should handle 2D points (missing Z)', () => {
      const p1 = [0, 0];
      const p2 = [3, 4];
      
      expect(euclideanDistance(p1, p2)).toBe(5);
    });

    it('should return 0 for identical points', () => {
      const p1 = [1, 2, 3];
      const p2 = [1, 2, 3];
      
      expect(euclideanDistance(p1, p2)).toBe(0);
    });

    it('should handle missing values with defaults', () => {
      const p1: number[] = [];
      const p2: number[] = [];
      
      expect(euclideanDistance(p1, p2)).toBe(0);
    });
  });

  describe('calculate3DHandSymmetry', () => {
    it('should return 1 for identical mirrored hands', () => {
      const leftHand = [
        [0.3, 0.5, 0.1],
        [0.4, 0.6, 0.2],
      ];
      const rightHand = [
        [0.7, 0.5, 0.1],  // Mirrored X (1 - 0.3 = 0.7)
        [0.6, 0.6, 0.2],  // Mirrored X (1 - 0.4 = 0.6)
      ];
      
      expect(calculate3DHandSymmetry(leftHand, rightHand)).toBeCloseTo(1, 1);
    });

    it('should return 0 for empty hands', () => {
      expect(calculate3DHandSymmetry([], [])).toBe(0);
      expect(calculate3DHandSymmetry([[1, 2, 3]], [])).toBe(0);
      expect(calculate3DHandSymmetry([], [[1, 2, 3]])).toBe(0);
    });

    it('should return lower symmetry for asymmetric hands', () => {
      const leftHand = [
        [0.2, 0.5, 0.1],
        [0.3, 0.6, 0.2],
      ];
      const rightHand = [
        [0.5, 0.9, 0.5],  // Very different
        [0.6, 0.2, 0.8],
      ];
      
      const symmetry = calculate3DHandSymmetry(leftHand, rightHand);
      expect(symmetry).toBeLessThan(0.5);
    });

    it('should use custom symmetry multiplier', () => {
      const leftHand = [[0.3, 0.5, 0.1]];
      const rightHand = [[0.8, 0.5, 0.1]];  // Slight difference after mirroring
      
      const symmetry1 = calculate3DHandSymmetry(leftHand, rightHand, 3);
      const symmetry2 = calculate3DHandSymmetry(leftHand, rightHand, 1);
      
      // Higher multiplier means more sensitivity to differences
      expect(symmetry1).toBeLessThanOrEqual(symmetry2);
    });
  });

  describe('normalizeVector', () => {
    it('should normalize 3D vector to unit length', () => {
      const v = [3, 4, 0];
      const normalized = normalizeVector(v);
      
      expect(normalized[0]).toBeCloseTo(0.6, 5);
      expect(normalized[1]).toBeCloseTo(0.8, 5);
      expect(normalized[2]).toBeCloseTo(0, 5);
      
      // Magnitude should be 1
      const magnitude = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should return original for zero vector', () => {
      const v = [0, 0, 0];
      const normalized = normalizeVector(v);
      
      expect(normalized).toEqual([0, 0, 0]);
    });

    it('should handle 2D vectors', () => {
      const v = [3, 4];
      const normalized = normalizeVector(v);
      
      expect(normalized[0]).toBeCloseTo(0.6, 5);
      expect(normalized[1]).toBeCloseTo(0.8, 5);
    });
  });

  describe('Hand landmark constants', () => {
    it('should have correct landmark indices', () => {
      expect(HAND_LANDMARK_INDICES.WRIST).toBe(0);
      expect(HAND_LANDMARK_INDICES.THUMB_TIP).toBe(4);
      expect(HAND_LANDMARK_INDICES.INDEX_TIP).toBe(8);
      expect(HAND_LANDMARK_INDICES.MIDDLE_TIP).toBe(12);
      expect(HAND_LANDMARK_INDICES.RING_TIP).toBe(16);
      expect(HAND_LANDMARK_INDICES.PINKY_TIP).toBe(20);
    });

    it('should have correct fingertip indices', () => {
      expect(FINGERTIP_INDICES).toEqual([4, 8, 12, 16, 20]);
    });

    it('should have correct MCP indices', () => {
      expect(MCP_INDICES).toEqual([5, 9, 13, 17]);
    });

    it('should have correct total landmark count', () => {
      expect(NUM_HAND_LANDMARKS).toBe(21);
    });
  });
});
