import { captureSamples } from '../../src/services/gestureRecorder';

const NO_LANDMARKS_ERROR = 'Ich sehe dich noch nicht. Beweg deine Hand ein bisschen!';

describe('captureSamples', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('collects frames and clones landmark data', async () => {
    const hand = Array.from({ length: 21 }, (_, i) => [i, i, i]);
    let current = hand;
    const handed = ['Left'];
    const getter = () => ({ landmarks: [current], handedness: handed });

    const promise = captureSamples(getter, 100, 50);
    jest.advanceTimersByTime(100);
    const frames = await promise;

    // mutate originals after capture
    current[0][0] = 999;
    handed[0] = 'Right';

    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].landmarks[0][0][0]).toBe(0);
    expect(frames[0].handedness[0]).toBe('Left');
  });

  it('throws an error when no landmarks are captured', async () => {
    const getter = () => ({ landmarks: [] as number[][][], handedness: [] });
    const promise = captureSamples(getter, 100, 50);
    jest.advanceTimersByTime(100);
    await expect(promise).rejects.toThrow(NO_LANDMARKS_ERROR);
  });
});
