jest.mock('@react-native-community/netinfo', () => ({
  fetch: async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
}));

jest.mock('../src/storage', () => ({
  loadProfile: async () => ({ consentHelpMeGetSmarter: true, id: 'amy' }),
  loadBackendApiToken: async () => 'token',
}));

jest.mock('../src/services/dgsModelClient', () => ({
  fetchCentroids: jest.fn(async () => null),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn() },
}));

import { syncTrainingData } from '../src/services/trainingSync';
import { fetchCentroids } from '../src/services/dgsModelClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../src/utils/logger';

const TRAINING_KEY = 'gestureTrainingData';

describe('syncTrainingData', () => {
  beforeEach(() => {
    (AsyncStorage as any).clear();
    jest.clearAllMocks();
    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('/train-model')) {
        return { ok: true, json: async () => ({ jobId: '1' }) } as any;
      }
      return { ok: true, json: async () => ({ status: 'completed', progress: 100 }) } as any;
    });
  });

  it('uploads pending samples with labels', async () => {
    await AsyncStorage.setItem(
      TRAINING_KEY,
      JSON.stringify([
        {
          id: '1',
          gestureDefinitionId: 'g1',
          frames: [
            {
              landmarks: [
                [[1, 2, 3]],
                [],
              ],
              handedness: ['Left', 'Right'],
            },
          ],
          source: 'HIP_2',
          syncStatus: 'pending',
        },
      ]),
    );

    await syncTrainingData();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.samples[0].gestureDefinitionId).toBe('g1');
    expect(body.samples[0].landmarkData[0]).toEqual([1, 2, 3]);
    expect(body.samples[0].landmarkData).toHaveLength(42);
    expect(body.samples[0].profileId).toBe('amy');
    expect(fetchCentroids).toHaveBeenCalledWith('amy');
    const updated = JSON.parse((await AsyncStorage.getItem(TRAINING_KEY))!);
    expect(updated[0].syncStatus).toBe('synced');
  });

  it('uploads legacy samples stored under landmarkData', async () => {
    await AsyncStorage.setItem(
      TRAINING_KEY,
      JSON.stringify([
        {
          id: '1',
          gestureDefinitionId: 'g1',
          landmarkData: [
            {
              landmarks: [
                [[1, 2, 3]],
                [],
              ],
              handedness: ['Left', 'Right'],
            },
          ],
          source: 'HIP_2',
          syncStatus: 'pending',
        },
      ]),
    );

    await syncTrainingData();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.samples[0].gestureDefinitionId).toBe('g1');
    expect(body.samples[0].landmarkData[0]).toEqual([1, 2, 3]);
    const updated = JSON.parse((await AsyncStorage.getItem(TRAINING_KEY))!);
    expect(updated[0].syncStatus).toBe('synced');
  });

  it('orders landmarks using handedness when hands are reversed', async () => {
    const left = Array.from({ length: 21 }, (_, i) => [i, i, i]);
    const right = Array.from({ length: 21 }, (_, i) => [i + 100, i + 100, i + 100]);
    await AsyncStorage.setItem(
      TRAINING_KEY,
      JSON.stringify([
        {
          id: '1',
          gestureDefinitionId: 'g1',
          frames: [
            {
              landmarks: [right, left],
              handedness: ['Right', 'Left'],
            },
          ],
          source: 'HIP_2',
          syncStatus: 'pending',
        },
      ]),
    );

    await syncTrainingData();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.samples[0].landmarkData[0]).toEqual([0, 0, 0]);
    expect(body.samples[0].landmarkData[21]).toEqual([100, 100, 100]);
  });

  it('logs warning and keeps samples pending on failure', async () => {
    await AsyncStorage.setItem(
      TRAINING_KEY,
      JSON.stringify([
        {
          id: '1',
          gestureDefinitionId: 'g1',
          frames: [
            { landmarks: [[[1, 2, 3]], []], handedness: ['Left', 'Right'] },
          ],
          source: 'HIP_2',
          syncStatus: 'pending',
        },
      ]),
    );

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await syncTrainingData();

    expect(logger.warn).toHaveBeenCalledWith(
      'training sync failed',
      expect.any(Error),
    );
    const updated = JSON.parse((await AsyncStorage.getItem(TRAINING_KEY))!);
    expect(updated[0].syncStatus).toBe('pending');
  });
});
