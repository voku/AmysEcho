import AsyncStorage from '@react-native-async-storage/async-storage';
import { Telemetry } from '../src/telemetry/recorder';

jest.mock('@react-native-async-storage/async-storage');

describe('Telemetry recorder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists events to AsyncStorage', async () => {
    const recorder = new Telemetry();
    await recorder.add('foo', 12, 'test');
    jest.runAllTimers();
    await (recorder as any).workQueue;
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'telemetryEvents',
      expect.any(String),
    );
    const dump = await recorder.dump();
    expect(dump).toHaveLength(1);
    expect(dump[0].event).toBe('foo');
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('telemetryEvents', '[]');
  });

  it('persists pending events before dumping', async () => {
    const recorder = new Telemetry();
    await recorder.add('foo', 1);
    const dump = await recorder.dump();
    expect(dump).toHaveLength(1);
    const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0][1])).toEqual([
      expect.objectContaining({ event: 'foo' }),
    ]);
    expect(calls[1]).toEqual(['telemetryEvents', '[]']);
  });

  it('loads existing events from storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify([{ timestamp: 1, latencyMs: 5, event: 'stored' }]),
    );
    const recorder = new Telemetry();
    const events = await recorder.dump();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('stored');
  });

  it('does not return events if clearing storage fails', async () => {
    const recorder = new Telemetry();
    await recorder.add('foo', 10);
    jest.runAllTimers();
    await (recorder as any).workQueue;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('clear failed'),
    );
    const first = await recorder.dump();
    expect(first).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      'Error clearing stored telemetry events',
      expect.any(Error),
    );
    warnSpy.mockRestore();
    const second = await recorder.dump();
    expect(second).toHaveLength(1);
    expect(second[0].event).toBe('foo');
  });

  it('logs when stored telemetry is corrupted', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('invalid');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const recorder = new Telemetry();
    await recorder.dump();
    expect(warnSpy).toHaveBeenCalledWith(
      'Error parsing stored telemetry events.',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('logs when loading telemetry fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('boom'),
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const recorder = new Telemetry();
    await recorder.dump();
    expect(warnSpy).toHaveBeenCalledWith(
      'Error loading telemetry events from storage.',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('logs when persisting telemetry fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const recorder = new Telemetry();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('save failed'),
    );
    await recorder.add('foo', 1);
    jest.runAllTimers();
    await (recorder as any).workQueue;
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to persist telemetry events.',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('ignores non-array persisted telemetry', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('{}');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const recorder = new Telemetry();
    const events = await recorder.dump();
    expect(events).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      'Persisted telemetry is not an array and will be ignored.',
    );
    warnSpy.mockRestore();
  });

  it('filters invalid events and clamps to MAX when loading', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      timestamp: i,
      latencyMs: 0,
      event: `e${i}`,
    }));
    many.unshift({ timestamp: -1, latencyMs: 0 } as any);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(many));
    const recorder = new Telemetry();
    const events = await recorder.dump();
    expect(events).toHaveLength(500);
    expect(events[0].timestamp).toBe(1);
  });

  it('serializes add and dump operations', async () => {
    const recorder = new Telemetry();
    await recorder.add('first', 1);
    jest.runAllTimers();
    await (recorder as any).workQueue;

    const deferred: { promise: Promise<void>; resolve: () => void } = (() => {
      let resolve!: () => void;
      return {
        promise: new Promise<void>((res) => (resolve = res)),
        resolve,
      };
    })();

    // Next setItem call (for dump) will hang until we resolve
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => deferred.promise);

    const dumpPromise = recorder.dump();
    const addPromise = recorder.add('second', 2);
    await Promise.resolve();
    // add should not persist until dump finishes
    expect((AsyncStorage.setItem as jest.Mock).mock.calls).toHaveLength(2);

    deferred.resolve();
    const firstDump = await dumpPromise;
    await addPromise;

    expect(firstDump.map((e) => e.event)).toEqual(['first']);
    const secondDump = await recorder.dump();
    expect(secondDump.map((e) => e.event)).toEqual(['second']);
  });

  it('batches rapid events into a single persistence call', async () => {
    const recorder = new Telemetry();
    await recorder.add('a', 1);
    await recorder.add('b', 2);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(0);
    jest.runAllTimers();
    await (recorder as any).workQueue;
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]);
    expect(payload.map((e: any) => e.event)).toEqual(['a', 'b']);
  });
});
