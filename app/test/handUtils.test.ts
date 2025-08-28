import {
  flattenHandsWithHandedness,
  HAND_LANDMARKS_PER_HAND,
  processFramesForUpload,
  frameHasAnyLandmarks,
} from '../src/services/handUtils';

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
    left[0] = [1, 2, 3, 4];
    left[1] = [5, 6];
    right[0] = [7, 8, 9, 10];
    right[1] = [11, 12];
    const out = flattenHandsWithHandedness([left, right], ['Left', 'Right']);
    expect(out[0]).toEqual([1, 2, 3]);
    expect(out[1]).toEqual([5, 6, 0]);
    expect(out[HAND_LANDMARKS_PER_HAND]).toEqual([7, 8, 9]);
    expect(out[HAND_LANDMARKS_PER_HAND + 1]).toEqual([11, 12, 0]);
  });
});

describe('frameHasAnyLandmarks', () => {
  it('returns false for non-array input', () => {
    // @ts-expect-error intentionally passing invalid input
    expect(frameHasAnyLandmarks(null)).toBe(false);
  });

  it('detects presence of landmarks', () => {
    expect(frameHasAnyLandmarks([])).toBe(false);
    expect(frameHasAnyLandmarks([[]])).toBe(false);
    expect(frameHasAnyLandmarks([[[1, 2, 3]], []])).toBe(true);
  });

  it('returns false for non-array inner values', () => {
    // @ts-expect-error
    expect(frameHasAnyLandmarks([null as any])).toBe(false);
    // @ts-expect-error
    expect(frameHasAnyLandmarks([123 as any])).toBe(false);
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
    expect(out[0].gestureDefinitionId).toBe('g1');
    expect(out[0].profileId).toBe('p1');
    expect(out[0].landmarkData.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
  });

  it('filters frames without landmarks', () => {
    const frames = [{ landmarks: [], handedness: [] }];
    const out = processFramesForUpload(frames, 'g1');
    expect(out).toHaveLength(0);
  });

  it('supports legacy frame format', () => {
    const left = makeHand(0);
    const right = makeHand(100);
    const frames = [[left, right]];
    const out = processFramesForUpload(frames, 'g1');
    expect(out).toHaveLength(1);
    expect(out[0].landmarkData.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
    expect(out[0].landmarkData.slice(HAND_LANDMARKS_PER_HAND)).toEqual(right);
  });

  it('normalizes flattened legacy arrays', () => {
    const left = makeHand(0);
    const right = makeHand(100);
    const flattened = [...left, ...right];
    const out = processFramesForUpload(flattened, 'g1');
    expect(out).toHaveLength(1);
    expect(out[0].landmarkData.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
    expect(out[0].landmarkData.slice(HAND_LANDMARKS_PER_HAND)).toEqual(right);
  });

  it('drops incomplete trailing landmarks in flattened legacy arrays', () => {
    const left = makeHand(0);
    const right = makeHand(100);
    const flattened = [...left, ...right, [1, 2, 3]];
    const out = processFramesForUpload(flattened, 'g1');
    expect(out).toHaveLength(1);
    expect(out[0].landmarkData.slice(0, HAND_LANDMARKS_PER_HAND)).toEqual(left);
    expect(out[0].landmarkData.slice(HAND_LANDMARKS_PER_HAND)).toEqual(right);
  });
});

