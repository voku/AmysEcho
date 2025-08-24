import { classifyWithCentroids } from '../src/services/offlineClassifier';
import type { CentroidMap } from '../src/services/dgsModelClient';

describe('offlineClassifier', () => {
  test('classifies landmarks to closest centroid with high confidence', () => {
    const centroids: CentroidMap = {
      g1: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      g2: [
        [0, 0, 0],
        [0, 1, 0],
      ],
    };
    const landmarks = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    const result = classifyWithCentroids(landmarks, centroids);
    expect(result).not.toBeNull();
    expect(result!.label).toBe('g1');
    expect(result!.confidence).toBeGreaterThan(0.99);
  });

  test('returns null when no centroids available', () => {
    const result = classifyWithCentroids([[0, 0, 0]], {});
    expect(result).toBeNull();
  });
});
