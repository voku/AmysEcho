import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryRecorder } from './recorder';

describe('TelemetryRecorder', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists events with throttling', async () => {
    const recorder = new TelemetryRecorder();
    await recorder.whenReady();
    await recorder.add('camera_started', { latencyMs: 12, source: 'test', details: { foo: 'bar' } });
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    const stored = JSON.parse(localStorage.getItem('telemetryEvents') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ event: 'camera_started', latencyMs: 12, source: 'test' });
    expect(stored[0].details).toEqual({ foo: 'bar' });
  });

  it('loads persisted events on construction', async () => {
    const initial = [{ event: 'existing', timestamp: Date.now() - 1000 }];
    localStorage.setItem('telemetryEvents', JSON.stringify(initial));
    const recorder = new TelemetryRecorder();
    await recorder.whenReady();
    const dumped = await recorder.dump();
    expect(dumped).toHaveLength(1);
    const firstEvent = dumped[0];
    if (firstEvent) {
      expect(firstEvent.event).toBe('existing');
    }
  });

  it('caps buffer to max entries and clears storage on dump', async () => {
    const recorder = new TelemetryRecorder();
    await recorder.whenReady();
    const addPromises: Promise<void>[] = [];
    for (let i = 0; i < 510; i += 1) {
      addPromises.push(recorder.add(`event_${i}`));
    }
    await Promise.all(addPromises);
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    const stored = JSON.parse(localStorage.getItem('telemetryEvents') || '[]');
    expect(stored).toHaveLength(500);
    expect(stored[0].event).toBe('event_10');

    const dumped = await recorder.dump();
    expect(dumped).toHaveLength(500);
    expect(localStorage.getItem('telemetryEvents')).toBe('[]');
  });

  it('works without localStorage (non-browser runtime)', async () => {
    const originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
    });

    try {
      const recorder = new TelemetryRecorder();
      await recorder.whenReady();
      await recorder.add('camera_started', { source: 'test' });
      const dumped = await recorder.dump();
      expect(dumped).toHaveLength(1);
      expect(dumped[0]?.event).toBe('camera_started');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
      });
    }
  });
});
