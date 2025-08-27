import { captureSamples } from '../../src/services/gestureRecorder';

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
    const getter = () => [current];

    const promise = captureSamples(getter, 100, 50);
    jest.advanceTimersByTime(100);
    const frames = await promise;

    // mutate original after capture
    current[0][0] = 999;
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0][0][0][0]).toBe(0);
  });

  it('wirft Fehler, wenn keine Landmarken erfasst wurden', async () => {
    const getter = () => [] as number[][][];
    const promise = captureSamples(getter, 100, 50);
    jest.advanceTimersByTime(100);
    await expect(promise).rejects.toThrow('Keine Landmarken erfasst');
  });
});
