import { enqueueCrashReport, flushCrashReports } from '../src/services/crashReporting';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

describe('crashReporting', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true, status: 202 })) as any;
  });

  it('queues and flushes crash reports', async () => {
    await enqueueCrashReport(new Error('boom'), { screen: 'Recognition' });
    await enqueueCrashReport('string error');

    const uploaded = await flushCrashReports();
    expect(uploaded).toBe(2);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    const call = (global as any).fetch.mock.calls[0];
    expect(call[0]).toContain('/api/crash-reports');
    const body = JSON.parse(call[1].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].message).toBe('boom');
    expect(body[0].extra.screen).toBe('Recognition');
  });
});

