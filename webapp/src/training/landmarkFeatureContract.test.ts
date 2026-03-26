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

  it('zero-fills the missing hand slot when only one hand is provided', () => {
    const perHandLength = CONTRACT_HAND_LANDMARK_COUNT * CONTRACT_COORDS_PER_POINT;
    const oneHandFrame = [CONTRACT_FIXTURE_FRAME[0]]; // only left hand

    const vector = buildDualHandFeatureVector(oneHandFrame);
    expect(vector).toHaveLength(perHandLength * 2);

    // Right-hand segment (second half) must be all zeros
    const rightSlot = vector.slice(perHandLength);
    expect(rightSlot.every((v) => v === 0)).toBe(true);
  });

  it('maps explicit handedness metadata into fixed [left,right] vector order', () => {
    const perHandLength = CONTRACT_HAND_LANDMARK_COUNT * CONTRACT_COORDS_PER_POINT;
    const rightFirst = [
      { landmarks: CONTRACT_FIXTURE_FRAME[1], handedness: 'Right' },
      { landmarks: CONTRACT_FIXTURE_FRAME[0], handedness: 'Left' },
    ];
    const vector = buildDualHandFeatureVector(rightFirst);
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

  it('zero-fills an invalid landmark slot without shifting subsequent indices', () => {
    const perHandLength = CONTRACT_HAND_LANDMARK_COUNT * CONTRACT_COORDS_PER_POINT;
    // Build a 21-point hand where landmark at index 2 has NaN coordinates
    const fullHand = Array.from({ length: CONTRACT_HAND_LANDMARK_COUNT }, (_, i) => [
      0.1 * i, 0.1 * i, 0,
    ]);
    fullHand[2] = [NaN, 0.5, 0]; // invalid — should be zero-filled in-place

    const result = normalizeHandLandmarksWristRelative(fullHand);
    // Output length should be exactly 21*3
    expect(result).toHaveLength(perHandLength);

    // Landmark index 2 should be [0,0,0] (wrist-relative zero) after zero-fill
    // (wrist == landmarks[0] == [0,0,0], so centered[2] == [0,0,0])
    expect(result[6]).toBe(0); // x of slot 2
    expect(result[7]).toBe(0); // y of slot 2
    expect(result[8]).toBe(0); // z of slot 2

    // No NaN or Infinity in output
    expect(result.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('toPoint rejects NaN and Infinity coordinates and outputs all-finite results', () => {
    // An invalid coordinate (NaN) should produce a zero-fill, not NaN in output
    const hand21 = Array.from({ length: CONTRACT_HAND_LANDMARK_COUNT }, () => [0.1, 0.2, 0.3]);
    hand21[0] = [NaN, 0.2, 0.3]; // invalid wrist
    const result = normalizeHandLandmarksWristRelative(hand21);
    expect(result.every((v) => Number.isFinite(v))).toBe(true);

    // Infinity coordinate should also produce no non-finite output
    const hand21Inf = Array.from({ length: CONTRACT_HAND_LANDMARK_COUNT }, () => [0.1, 0.2, 0.3]);
    hand21Inf[3] = [Infinity, 0.2, 0.3]; // invalid point
    const resultInf = normalizeHandLandmarksWristRelative(hand21Inf);
    expect(resultInf.every((v) => Number.isFinite(v))).toBe(true);
  });
});
