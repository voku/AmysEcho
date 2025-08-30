const store: Record<string, string> = {};
const stubAsync = {
  async getItem(key: string) {
    return store[key] ?? null;
  },
  async setItem(key: string, value: string) {
    store[key] = value;
  },
  async removeItem(key: string) {
    delete store[key];
  },
};

jest.mock('@react-native-async-storage/async-storage', () => stubAsync);

import { saveHistoricalHealthData } from '../src/services/healthScore';
import { getPracticeRecommendation } from '../src/services/practiceRecommender';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Practice recommender', () => {
  it('suggests practice when last days decline', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2023-09-08T12:00:00Z'));
    const rates = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
    for (let i = 0; i < rates.length; i++) {
      await saveHistoricalHealthData('g1', {
        date: `2023-09-${String(i + 1).padStart(2, '0')}`,
        successRate: rates[i],
        count: 5,
      });
    }
    const rec = await getPracticeRecommendation('g1');
    const expected = new Date();
    expected.setDate(expected.getDate() + 1);
    expect(rec?.getTime()).toBe(expected.getTime());
  });
});

