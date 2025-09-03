import { classifyWithCentroids, normalize } from '../src/services/offlineClassifier';
import type { CentroidMap, Point } from '../src/services/dgsModelClient';

describe('offlineClassifier', () => {
  const makeHand = (tip: Point): Point[] => {
    const pts: Point[] = Array.from({ length: 21 }, () => [0, 0, 0] as Point);
    pts[1] = tip;
    return pts;
  };

  test('classifies landmarks to closest centroid with high confidence', () => {
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
    const result = classifyWithCentroids([[0, 0, 0] as Point], {});
    expect(result).toBeNull();
  });

  test('normalize scales each hand independently', () => {
    const left: Point[] = Array.from({ length: 21 }, () => [0, 0, 0] as Point);
    left[1] = [2, 0, 0];
    const right: Point[] = Array.from({ length: 21 }, () => [10, 0, 0] as Point);
    right[1] = [11, 0, 0];
    const norm = normalize(left.concat(right));
    expect(norm[1][0]).toBeCloseTo(1, 5); // left hand tip
    expect(norm[21][0]).toBeCloseTo(0, 5); // right wrist becomes origin
    expect(norm[22][0]).toBeCloseTo(1, 5); // right hand tip
  });

  test('normalize pads and truncates to 42 landmarks', () => {
    const hand: Point[] = Array.from({ length: 21 }, () => [0, 0, 0] as Point);
    const norm = normalize(hand);
    expect(norm).toHaveLength(42);
    for (let i = 21; i < 42; i++) {
      expect(norm[i]).toEqual([0, 0, 0]);
    }
    const long: Point[] = Array.from({ length: 60 }, () => [0, 0, 0] as Point);
    const normLong = normalize(long);
    expect(normLong).toHaveLength(42);
  });
});
