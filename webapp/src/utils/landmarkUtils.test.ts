import { describe, expect, it } from 'vitest';
import {
  cloneLandmarks,
  adjustHandednessForMirror,
  createHandLandmarkStabilizer,
} from './landmarkUtils';

describe('landmarkUtils', () => {
  it('deep clones multi-hand landmarks', () => {
    const source = [
      [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
      [
        [0.7, 0.8, 0.9],
      ],
    ];

    const cloned = cloneLandmarks(source);
    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned[0]).not.toBe(source[0]);
    expect(cloned[0]?.[0]).not.toBe(source[0]?.[0]);
  });

  it('leaves handedness unchanged when not mirrored', () => {
    const handedness = ['Left', 'Right', 'unknown'];
    expect(adjustHandednessForMirror(handedness, false)).toEqual(handedness);
  });

  it('keeps handedness orientation when mirrored', () => {
    expect(adjustHandednessForMirror(['Left', 'Right', 'unknown'], true)).toEqual([
      'Left',
      'Right',
      'unknown',
    ]);
  });

  it('fills empty handedness labels with positional fallbacks', () => {
    expect(adjustHandednessForMirror(['', undefined as unknown as string, '  '], true)).toEqual([
      'Hand 1',
      'Hand 2',
      'Hand 3',
    ]);
  });

  describe('createHandLandmarkStabilizer', () => {
    const leftHand = Array.from({ length: 21 }, (_, index) => [index / 20, index / 20, 0]);
    const rightHand = Array.from({ length: 21 }, (_, index) => [1 - index / 20, index / 20, 0]);

    it('returns both hands with their labels when provided', () => {
      const stabilizer = createHandLandmarkStabilizer();

      const { landmarks, handedness } = stabilizer.update([leftHand, rightHand], ['Left', 'Right'], 0);

      expect(landmarks).toHaveLength(2);
      expect(handedness).toEqual(['Left', 'Right']);
      expect(landmarks[0]).toEqual(leftHand);
      expect(landmarks[1]).toEqual(rightHand);
      expect(landmarks[0]).not.toBe(leftHand);
      expect(landmarks[1]).not.toBe(rightHand);
    });

    it('keeps the last seen hand for a short TTL when one hand disappears', () => {
      const stabilizer = createHandLandmarkStabilizer({ ttlMs: 300 });

      stabilizer.update([leftHand, rightHand], ['Left', 'Right'], 0);
      const { landmarks, handedness } = stabilizer.update([leftHand], ['Left'], 100);

      expect(landmarks).toHaveLength(2);
      expect(handedness).toEqual(['Left', 'Right']);
    });

    it('drops stale hands after the TTL expires', () => {
      const stabilizer = createHandLandmarkStabilizer({ ttlMs: 150 });

      stabilizer.update([leftHand, rightHand], ['Left', 'Right'], 0);
      const { landmarks, handedness } = stabilizer.update([leftHand], ['Left'], 200);

      expect(landmarks).toHaveLength(1);
      expect(handedness).toEqual(['Left']);
    });

    it('assigns stable IDs to unlabeled hands', () => {
      const stabilizer = createHandLandmarkStabilizer({ ttlMs: 200 });

      const handA = Array.from({ length: 21 }, () => [0.2, 0.2, 0]);
      const handB = Array.from({ length: 21 }, () => [0.8, 0.2, 0]);

      const first = stabilizer.update([handA, handB], ['Left', ''], 0);
      expect(first.handedness).toEqual(['Left', 'Hand 2']);

      const second = stabilizer.update([handA], ['Left'], 100);
      expect(second.handedness).toEqual(['Left', 'Hand 2']);
      expect(second.landmarks).toHaveLength(2);

      const third = stabilizer.update([], [], 400);
      expect(third.handedness).toEqual([]);
      expect(third.landmarks).toEqual([]);
    });
  });
});
