import { describe, expect, it } from 'vitest';
import {
  HAND_LANDMARKS_PER_HAND,
  flattenHandsWithHandedness,
  frameHasAnyLandmarks,
  framesHaveHandLandmarks,
  processFramesForUpload,
  suggestHandFocus,
} from './handUtils';

describe('flattenHandsWithHandedness', () => {
  const makeHand = (offset: number) =>
    Array.from({ length: HAND_LANDMARKS_PER_HAND }, (_, i) => [i + offset, i + offset, i + offset]);

  it('orders hands according to handedness array', () => {
    const left = makeHand(0);
    const right = makeHand(100);
    const out = flattenHandsWithHandedness([right, left], ['Right', 'Left']);
    expect(out.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
    expect(out.slice(HAND_LANDMARKS_PER_HAND)).toEqual(right);
  });

  it('pads missing hands with zeros', () => {
    const right = makeHand(100);
    const out = flattenHandsWithHandedness([right], ['Right']);
    const zeros = Array.from({ length: HAND_LANDMARKS_PER_HAND }, () => [0, 0, 0]);
    expect(out.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(zeros);
    expect(out.slice(HAND_LANDMARKS_PER_HAND)).toEqual(right);
  });

  it('coerces landmarks to 3D triplets', () => {
    const left = Array.from({ length: HAND_LANDMARKS_PER_HAND }, () => [0, 0, 0]);
    const right = Array.from({ length: HAND_LANDMARKS_PER_HAND }, () => [0, 0, 0]);
    left[0] = [1, 2, 3, 4] as number[];
    left[1] = [5, 6] as number[];
    right[0] = [7, 8, 9, 10] as number[];
    right[1] = [11, 12] as number[];
    const out = flattenHandsWithHandedness([left, right], ['Left', 'Right']);
    expect(out[0]).toEqual([1, 2, 3]);
    expect(out[1]).toEqual([5, 6, 0]);
    expect(out[HAND_LANDMARKS_PER_HAND]).toEqual([7, 8, 9]);
    expect(out[HAND_LANDMARKS_PER_HAND + 1]).toEqual([11, 12, 0]);
  });
});

describe('frameHasAnyLandmarks', () => {
  it('returns false for non-array input', () => {
    expect(frameHasAnyLandmarks(null as any)).toBe(false);
  });

  it('detects presence of landmarks', () => {
    expect(frameHasAnyLandmarks([])).toBe(false);
    expect(frameHasAnyLandmarks([[]] as any)).toBe(false);
    expect(frameHasAnyLandmarks([[[1, 2, 3]], []] as any)).toBe(true);
  });

  it('detects pose or face landmarks when hands are missing', () => {
    expect(frameHasAnyLandmarks({ poseLandmarks: [[0, 0, 0]] } as any)).toBe(true);
    expect(frameHasAnyLandmarks({ faceLandmarks: [[0.1, 0.2, 0.3]] } as any)).toBe(true);
  });

  it('returns false for non-array inner values', () => {
    expect(frameHasAnyLandmarks([null as any])).toBe(false);
    expect(frameHasAnyLandmarks([123 as any])).toBe(false);
  });
});

describe('framesHaveHandLandmarks', () => {
  it('returns false when no hands are present', () => {
    expect(framesHaveHandLandmarks([])).toBe(false);
    expect(framesHaveHandLandmarks([{ landmarks: [] }])).toBe(false);
  });

  it('detects at least one hand with landmarks', () => {
    expect(framesHaveHandLandmarks([{ landmarks: [[[1, 2, 3]]] as unknown as number[][][] }])).toBe(true);
  });
});

describe('processFramesForUpload', () => {
  const makeHand = (offset: number) =>
    Array.from({ length: HAND_LANDMARKS_PER_HAND }, (_, i) => [i + offset, i + offset, i + offset]);

  it('flattens frames and attaches ids', () => {
    const left = makeHand(0);
    const frames = [{ landmarks: [left], handedness: ['Left'] }];
    const out = processFramesForUpload(frames, 'g1', 'p1');
    expect(out).toHaveLength(1);
    const firstOut = out[0];
    if (firstOut) {
      expect(firstOut.gestureDefinitionId).toBe('g1');
      expect(firstOut.profileId).toBe('p1');
      expect(firstOut.landmarkData.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
    }
  });

  it('filters frames without landmarks', () => {
    const frames = [{ landmarks: [], handedness: [] }];
    const out = processFramesForUpload(frames, 'g1');
    expect(out).toHaveLength(0);
  });

  it('supports legacy frame format', () => {
    const left = makeHand(0);
    const right = makeHand(100);
    const frames = [[left, right]] as any;
    const out = processFramesForUpload(frames, 'g1');
    expect(out).toHaveLength(1);
    const firstOut = out[0];
    if (firstOut) {
      expect(firstOut.landmarkData.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
      expect(firstOut.landmarkData.slice(HAND_LANDMARKS_PER_HAND)).toEqual(right);
    }
  });

  it('normalizes flattened legacy arrays', () => {
    const left = makeHand(0);
    const right = makeHand(100);
    const flattened = [...left, ...right] as any;
    const out = processFramesForUpload(flattened, 'g1');
    expect(out).toHaveLength(1);
    const firstOut = out[0];
    if (firstOut) {
      expect(firstOut.landmarkData.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
      expect(firstOut.landmarkData.slice(HAND_LANDMARKS_PER_HAND)).toEqual(right);
    }
  });

  it('drops incomplete trailing landmarks in flattened legacy arrays', () => {
    const left = makeHand(0);
    const right = makeHand(100);
    const flattened = [...left, ...right, [1, 2, 3]] as any;
    const out = processFramesForUpload(flattened, 'g1');
    expect(out).toHaveLength(1);
    const firstOut = out[0];
    if (firstOut) {
      expect(firstOut.landmarkData.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
      expect(firstOut.landmarkData.slice(HAND_LANDMARKS_PER_HAND)).toEqual(right);
    }
  });
});

describe('suggestHandFocus', () => {
  const makeHand = (offset: number) =>
    Array.from({ length: HAND_LANDMARKS_PER_HAND }, (_, i) => [i + offset, i + offset, i + offset]);

  it('returns low confidence with insufficient frames', () => {
    const result = suggestHandFocus([]);
    expect(result.confidence).toBe('low');
    expect(result.suggestion).toBe('both_equal');
  });

  it('suggests dominant_only when only right hand has data', () => {
    // Right hand data at index 0, handedness indicates 'Right' at index 0
    const frames = [
      { landmarks: [makeHand(1)], handedness: ['Right'] },
      { landmarks: [makeHand(2)], handedness: ['Right'] },
    ];
    const result = suggestHandFocus(frames);
    expect(result.suggestion).toBe('dominant_only');
    expect(result.confidence).toBe('high');
  });

  it('suggests dominant_only when only left hand has data', () => {
    // Left hand data at index 0, handedness indicates 'Left' at index 0
    const frames = [
      { landmarks: [makeHand(1)], handedness: ['Left'] },
      { landmarks: [makeHand(2)], handedness: ['Left'] },
    ];
    const result = suggestHandFocus(frames);
    expect(result.suggestion).toBe('dominant_only');
    expect(result.confidence).toBe('high');
  });

  it('suggests both_equal when both hands have similar motion', () => {
    const frames = [
      { landmarks: [makeHand(0), makeHand(100)], handedness: ['Left', 'Right'] },
      { landmarks: [makeHand(1), makeHand(101)], handedness: ['Left', 'Right'] },
      { landmarks: [makeHand(2), makeHand(102)], handedness: ['Left', 'Right'] },
    ];
    const result = suggestHandFocus(frames);
    expect(result.suggestion).toBe('both_equal');
  });

  it('suggests dominant_only when one hand moves significantly more', () => {
    // Right hand moves a lot, left hand static
    const staticLeft = makeHand(0);
    const frames = [
      { landmarks: [staticLeft, makeHand(100)], handedness: ['Left', 'Right'] },
      { landmarks: [staticLeft, makeHand(200)], handedness: ['Left', 'Right'] },
      { landmarks: [staticLeft, makeHand(300)], handedness: ['Left', 'Right'] },
    ];
    const result = suggestHandFocus(frames);
    expect(result.suggestion).toBe('dominant_only');
    expect(result.confidence).toBe('high');
  });
});
