jest.mock('@react-native-community/netinfo', () => ({
  fetch: async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
}));

jest.mock('../src/storage', () => ({
  loadProfile: async () => ({ consentHelpMeGetSmarter: true }),
  loadBackendApiToken: async () => 'token',
}));

import { syncTrainingData } from '../src/services/trainingSync';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TRAINING_KEY = 'gestureTrainingData';

describe('syncTrainingData', () => {
  beforeEach(() => {
    (AsyncStorage as any).clear();
    (global as any).fetch = jest.fn(async () => ({ ok: true }));
  });

  it('uploads pending samples with labels', async () => {
    await AsyncStorage.setItem(
      TRAINING_KEY,
      JSON.stringify([
        {
          id: '1',
          gestureDefinitionId: 'g1',
          landmarkData: [
            [
              [[1, 2, 3]],
              [],
            ],
          ],
          source: 'HIP_2',
          syncStatus: 'pending',
        },
      ]),
    );

    await syncTrainingData();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.samples[0].gestureDefinitionId).toBe('g1');
    expect(body.samples[0].landmarkData[0]).toEqual([1, 2, 3]);
    expect(body.samples[0].landmarkData).toHaveLength(42);
    const updated = JSON.parse((await AsyncStorage.getItem(TRAINING_KEY))!);
    expect(updated[0].syncStatus).toBe('synced');
  });
});
