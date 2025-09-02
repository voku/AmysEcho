import { classifyWithCentroids, normalize } from '../src/services/offlineClassifier';
import type { CentroidMap } from '../src/services/dgsModelClient';

describe('offlineClassifier', () => {
  test('classifies landmarks to closest centroid with high confidence', () => {
    const makeHand = (tip: [number, number, number]): number[][] => {
      const pts = Array.from({ length: 21 }, () => [0, 0, 0]);
      pts[1] = tip;
      return pts;
    };
    const centroids: CentroidMap = {
      g1: makeHand([1, 0, 0]),
      g2: makeHand([0, 1, 0]),
    };
    const landmarks = makeHand([1, 0, 0]);
    const result = classifyWithCentroids(landmarks, centroids);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('g1');
    expect(result!.confidence).toBeGreaterThan(0.99);
  });

  test('classifyWithCentroids considers z axis', () => {
    const makeHand = (tip: [number, number, number]): number[][] => {
      const pts = Array.from({ length: 21 }, () => [0, 0, 0]);
      pts[1] = tip;
      return pts;
    };
    const centroids: CentroidMap = {
      g1: makeHand([0, 0, 1]),
      g2: makeHand([0, 0, 0]),
    };
    const landmarks = makeHand([0, 0, 1]);
    const result = classifyWithCentroids(landmarks, centroids);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('g1');
  });

  test('returns null when no centroids available', () => {
    const result = classifyWithCentroids([[0, 0, 0]], {});
    expect(result).toBeNull();
  });

  test('normalize scales each hand independently', () => {
    const left = Array.from({ length: 21 }, () => [0, 0, 0]);
    left[1] = [2, 0, 0];
    const right = Array.from({ length: 21 }, () => [10, 0, 0]);
    right[1] = [11, 0, 0];
    const norm = normalize(left.concat(right));
    expect(norm[1][0]).toBeCloseTo(1, 5); // left hand tip
    expect(norm[21][0]).toBeCloseTo(0, 5); // right wrist becomes origin
    expect(norm[22][0]).toBeCloseTo(1, 5); // right hand tip
  });

  test('normalize pads and truncates to 42 landmarks', () => {
    const hand = Array.from({ length: 21 }, () => [0, 0, 0]);
    const norm = normalize(hand);
    expect(norm).toHaveLength(42);
    for (let i = 21; i < 42; i++) {
      expect(norm[i]).toEqual([0, 0, 0]);
    }
    const long = Array.from({ length: 60 }, () => [0, 0, 0]);
    const normLong = normalize(long);
    expect(normLong).toHaveLength(42);
  });
});
