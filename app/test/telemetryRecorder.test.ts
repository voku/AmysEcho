import AsyncStorage from '@react-native-async-storage/async-storage';
import { Telemetry } from '../src/telemetry/recorder';

jest.mock('@react-native-async-storage/async-storage');

describe('Telemetry recorder', () => {
  beforeEach(() => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('persists events to AsyncStorage', async () => {
    const recorder = new Telemetry();
    await recorder.add('foo', 12, 'test');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'telemetryEvents',
      expect.any(String),
    );
    const dump = await recorder.dump();
    expect(dump).toHaveLength(1);
    expect(dump[0].event).toBe('foo');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('telemetryEvents');
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
});
