const store: Record<string, string> = {};
const stubAsync = {
  async getItem(key: string) {
    return store[key] ?? null;
  },
  async setItem(key: string, value: string) {
    store[key] = value;
  },
};

jest.mock('@react-native-async-storage/async-storage', () => stubAsync);

import { saveHistoricalHealthData } from '../src/services/healthScore';
import { getPracticeRecommendation } from '../src/services/practiceRecommender';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('Practice recommender', () => {
  it('suggests practice when last days decline', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2023-09-08T12:00:00Z'));
    const rates = [0.9, 0.9, 0.9, 0.9, 0.9, 0.8, 0.7];
    for (let i = 0; i < rates.length; i++) {
      await saveHistoricalHealthData('g1', {
        date: `2023-09-${String(i + 1).padStart(2, '0')}`,
        successRate: rates[i],
        count: 5,
      });
    }
    const rec = await getPracticeRecommendation('g1');
    expect(rec).toEqual(new Date('2023-09-09T12:00:00Z'));
    jest.useRealTimers();
  });
});

