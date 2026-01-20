import { assessLandmarkConfidence } from '../landmarkConfidencePolicy';

describe('assessLandmarkConfidence', () => {
  it('returns false when no landmarks are present', () => {
    const result = assessLandmarkConfidence([], []);
    expect(result.shouldStream).toBe(false);
    expect(result.visibleHands).toBe(0);
    expect(result.totalHands).toBe(0);
  });

  it('streams when a hand meets minimum visible points', () => {
    const landmarks = [
      Array.from({ length: 21 }, () => [0.1, 0.2, 0.0]),
    ];
    const visibility = [
      Array.from({ length: 21 }, (_, index) => (index < 10 ? 1 : 0)),
    ];

    const result = assessLandmarkConfidence(landmarks, visibility);
    expect(result.shouldStream).toBe(true);
    expect(result.visibleHands).toBe(1);
    expect(result.totalHands).toBe(1);
  });

  it('skips when all hands fall below the visibility threshold', () => {
    const landmarks = [
      Array.from({ length: 21 }, () => [0.1, 0.2, 0.0]),
      Array.from({ length: 21 }, () => [0.2, 0.3, 0.0]),
    ];
    const visibility = [
      Array.from({ length: 21 }, (_, index) => (index < 3 ? 1 : 0)),
      Array.from({ length: 21 }, (_, index) => (index < 4 ? 1 : 0)),
    ];

    const result = assessLandmarkConfidence(landmarks, visibility);
    expect(result.shouldStream).toBe(false);
    expect(result.visibleHands).toBe(0);
    expect(result.totalHands).toBe(2);
  });
});
