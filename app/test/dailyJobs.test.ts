const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
}));

jest.mock('../src/model', () => ({
  gestureModel: { gestures: [{ id: 'g1', label: 'Hallo' }] },
}));

jest.mock('../src/services/practiceRecommender', () => ({
  getPracticeRecommendation: jest.fn(),
}));

jest.mock('../src/services/practiceScheduler', () => ({
  addSchedule: jest.fn(),
}));

import { runDailyJobs, checkAllGesturesForDecliningAccuracy, checkPracticeRecommendations } from '../src/services/dailyJobs';
import { getPracticeRecommendation } from '../src/services/practiceRecommender';
import { addSchedule } from '../src/services/practiceScheduler';
import { Alert } from 'react-native';

describe('dailyJobs', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    (getPracticeRecommendation as jest.Mock).mockReset();
    (addSchedule as jest.Mock).mockReset();
  });

  it('saves daily health metrics', async () => {
    const now = Date.now();
    const logs = [
      { id: '1', gestureDefinitionId: 'g1', wasSuccessful: true, confidenceScore: 0.9, timestamp: now, processedBy: 'local' },
      { id: '2', gestureDefinitionId: 'g1', wasSuccessful: false, confidenceScore: 0.5, timestamp: now, processedBy: 'local' },
    ];
    store['interactionLogs'] = JSON.stringify(logs);
    await runDailyJobs();
    const histRaw = store['historicalHealthData'];
    expect(histRaw).toBeTruthy();
    const hist = JSON.parse(histRaw)['g1'];
    expect(hist).toHaveLength(1);
    expect(hist[0].count).toBe(2);
  });

  it('alerts when accuracy declines', async () => {
    const data = {
      g1: Array.from({ length: 7 }).map((_, i) => ({
        date: `2023-09-${String(i + 1).padStart(2, '0')}`,
        successRate: 1 - i * 0.1,
        count: 5,
      })),
    };
    store['historicalHealthData'] = JSON.stringify(data);
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await checkAllGesturesForDecliningAccuracy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('schedules practice when recommended', async () => {
    (getPracticeRecommendation as jest.Mock).mockResolvedValue(new Date('2023-09-10T09:00:00Z'));
    await checkPracticeRecommendations();
    expect(addSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ gestureId: 'g1' })
    );
  });
});

