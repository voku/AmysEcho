import { describe, expect, it } from 'vitest';
import { MultimodalSmoother } from '../MultimodalSmoother';
import type { NormalizedMediaPipeResult } from '../mapMediaPipeResults';

function buildFrame(overrides: Partial<NormalizedMediaPipeResult> = {}): NormalizedMediaPipeResult {
  return {
    hands: [],
    landmarks: [],
    handednesses: [],
    poseLandmarks: [],
    faceLandmarks: [],
    ...overrides,
  };
}

describe('MultimodalSmoother', () => {
  it('returns identical values on first pass and smooths subsequent frames', () => {
    const smoother = new MultimodalSmoother();
    const first = buildFrame({
      landmarks: [[[0.1, 0.1, 0.1]]],
      poseLandmarks: [[0.2, 0.3, 0.4, 0.9]],
      faceLandmarks: [[0.3, 0.4, 0.5]],
    });

    const firstResult = smoother.smooth(first, 0);
    const firstHand = firstResult.landmarks[0];
    if (firstHand && firstHand[0]) {
      expect(firstHand[0]).toEqual([0.1, 0.1, 0.1]);
    }
    expect(firstResult.poseLandmarks[0]).toEqual([0.2, 0.3, 0.4, 0.9]);
    expect(firstResult.faceLandmarks[0]).toEqual([0.3, 0.4, 0.5]);

    const second = buildFrame({
      landmarks: [[[0.2, 0.3, 0.4]]],
      poseLandmarks: [[0.4, 0.5, 0.6, 0.8]],
      faceLandmarks: [[0.5, 0.6, 0.7]],
    });

    const secondResult = smoother.smooth(second, 1);
    const secondHand = secondResult.landmarks[0];
    const handPoint = secondHand ? secondHand[0] : undefined;
    if (handPoint) {
      expect(handPoint[0]).toBeGreaterThan(0.15);
      expect(handPoint[0]).toBeLessThan(0.2);
    }

    const posePoint = secondResult.poseLandmarks[0];
    if (posePoint) {
      expect(posePoint[0]).toBeGreaterThan(0.25);
      expect(posePoint[0]).toBeLessThan(0.4);
      expect(posePoint[3]).toBe(0.8);
    }

    const facePoint = secondResult.faceLandmarks[0];
    if (facePoint) {
      expect(facePoint[0]).toBeGreaterThan(0.35);
      expect(facePoint[0]).toBeLessThan(0.5);
    }
  });

  it('caps smoothing to expected landmark counts', () => {
    const smoother = new MultimodalSmoother();
    const landmarks = Array.from({ length: 3 }, (_, i) => [i * 0.1, i * 0.2, i * 0.3]);
    const poseLandmarks = Array.from({ length: 40 }, (_, i) => [i * 0.01, i * 0.02, i * 0.03, 1]);
    const faceLandmarks = Array.from({ length: 500 }, (_, i) => [i * 0.001, i * 0.002, i * 0.003]);

    const result = smoother.smooth(
      buildFrame({ landmarks: [landmarks], poseLandmarks, faceLandmarks }),
      0,
    );

    expect(result.landmarks[0]).toHaveLength(3);
    expect(result.poseLandmarks).toHaveLength(33);
    expect(result.faceLandmarks).toHaveLength(468);
  });
});
