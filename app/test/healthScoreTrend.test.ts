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

import {
  saveHistoricalHealthData,
  loadHistoricalHealthData,
  checkForDecliningAccuracy,
  generateProgressReport,
} from '../src/services/healthScore';
import { getPracticeRecommendation } from '../src/services/practiceRecommender';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('Health score trend analysis', () => {
  it('saves and loads historical health data', async () => {
    await saveHistoricalHealthData('g1', { date: '2023-09-01', successRate: 0.8, count: 5 });
    await saveHistoricalHealthData('g1', { date: '2023-09-02', successRate: 1.0, count: 3 });
    const data = await loadHistoricalHealthData('g1');
    expect(data).toHaveLength(2);
    expect(data[0].successRate).toBe(0.8);
  });

  it('detects declining accuracy', async () => {
    for (let i = 0; i < 7; i++) {
      await saveHistoricalHealthData('g1', {
        date: `2023-09-0${i + 1}`,
        successRate: 1 - i * 0.1,
        count: 5,
      });
    }
    await expect(checkForDecliningAccuracy('g1')).resolves.toBe(true);
  });

  it('generates progress reports with trend data', async () => {
    await saveHistoricalHealthData('g1', { date: '2023-09-01', successRate: 0.5, count: 2 });
    await saveHistoricalHealthData('g1', { date: '2023-09-02', successRate: 1.0, count: 4 });
    const report = await generateProgressReport('g1');
    expect(report.averageSuccessRate).toBeCloseTo(5 / 6);
    expect(report.totalSamples).toBe(6);
    expect(report.trend).toBeGreaterThan(0);
  });

  it('suggests practice when last days decline', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2023-09-08T12:00:00Z'));
    // prepare 7 days of data where last 3 decline
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

