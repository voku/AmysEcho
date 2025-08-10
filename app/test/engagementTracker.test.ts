const store: Record<string, string> = {};
const stub = {
  async getItem(key: string) { return store[key] ?? null; },
  async setItem(key: string, value: string) { store[key] = value; },
};

jest.mock('@react-native-async-storage/async-storage', () => stub);

import { startSession, endSession, loadEngagementStats } from '../src/services/engagementTracker';

describe('EngagementTracker', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('records session durations', async () => {
    const spy = jest.spyOn(Date, 'now');
    spy.mockReturnValueOnce(1000); // session start
    await startSession();
    spy.mockReturnValueOnce(4000); // session end
    await endSession('p1');
    const stats = await loadEngagementStats('p1');
    expect(stats.totalSessions).toBe(1);
    expect(stats.totalDurationMs).toBe(3000);
    expect(stats.averageDurationMs).toBe(3000);
    spy.mockRestore();
  });
});
