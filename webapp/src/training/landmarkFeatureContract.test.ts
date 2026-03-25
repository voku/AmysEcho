import { describe, expect, it } from 'vitest';
import {
  buildDualHandFeatureVector,
  CONTRACT_COORDS_PER_POINT,
  CONTRACT_HAND_LANDMARK_COUNT,
  normalizeHandLandmarksWristRelative,
} from './landmarkFeatureContract';
import {
  CONTRACT_FIXTURE_FRAME,
  CONTRACT_FIXTURE_LEFT_NORMALIZED_PREFIX,
  CONTRACT_FIXTURE_RIGHT_NORMALIZED_PREFIX,
} from './__fixtures__/landmarkFeatureContract.fixture';

describe('landmarkFeatureContract', () => {
  const expectApproxArray = (actual: number[], expected: number[]) => {
    expect(actual.length).toBe(expected.length);
    actual.forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index] ?? 0, 6);
    });
  };

  it('normalizes hand landmarks relative to wrist and max abs value', () => {
    const normalized = normalizeHandLandmarksWristRelative(CONTRACT_FIXTURE_FRAME[0]!);
    expectApproxArray(
      normalized.slice(0, CONTRACT_FIXTURE_LEFT_NORMALIZED_PREFIX.length),
      CONTRACT_FIXTURE_LEFT_NORMALIZED_PREFIX,
    );
  });

  it('builds a stable dual-hand feature vector with zero padding', () => {
    const vector = buildDualHandFeatureVector(CONTRACT_FIXTURE_FRAME);
    const perHandLength = CONTRACT_HAND_LANDMARK_COUNT * CONTRACT_COORDS_PER_POINT;

    expect(vector).toHaveLength(perHandLength * 2);
    expectApproxArray(
      vector.slice(0, CONTRACT_FIXTURE_LEFT_NORMALIZED_PREFIX.length),
      CONTRACT_FIXTURE_LEFT_NORMALIZED_PREFIX,
    );
    expectApproxArray(
      vector.slice(perHandLength, perHandLength + CONTRACT_FIXTURE_RIGHT_NORMALIZED_PREFIX.length),
      CONTRACT_FIXTURE_RIGHT_NORMALIZED_PREFIX,
    );
  });
});
