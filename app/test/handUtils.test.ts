import {
  flattenHandsWithHandedness,
  HAND_LANDMARKS_PER_HAND,
  processFramesForUpload,
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
});

