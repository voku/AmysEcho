const store: Record<string, string> = {};
const stub = {
  async getItem(key: string) { return store[key] ?? null; },
  async setItem(key: string, value: string) { store[key] = value; }
};

jest.mock('@react-native-async-storage/async-storage', () => stub);

import { incrementUsage, loadUsageStats } from '../src/services/usageTracker';

describe('Usage Tracker', () => {
  it('should increment and load usage stats correctly', async () => {
    const entry = { id: 'hello', label: 'Hello' };
    await incrementUsage(entry, 'p1');
    await incrementUsage(entry, 'p1');
    await incrementUsage(entry, 'p2');

    const stats1 = await loadUsageStats('p1');
    const stats2 = await loadUsageStats('p2');

    expect(stats1.hello).toBe(2);
    expect(stats2.hello).toBe(1);
  });
});
