const mockNetInfoFetch = jest.fn(async () => ({
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: mockNetInfoFetch },
  fetch: mockNetInfoFetch,
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

const setupPendingSample = () =>
  AsyncStorage.setItem(
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

describe('syncTrainingData', () => {
  beforeEach(async () => {
    await (AsyncStorage as any).clear();
    jest.clearAllMocks();
    mockNetInfoFetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
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

  it('skips syncing when network is not wifi', async () => {
    await setupPendingSample();

    mockNetInfoFetch.mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: 'cellular',
    });

    await syncTrainingData();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockNetInfoFetch).toHaveBeenCalledTimes(1);
    const stored = JSON.parse((await AsyncStorage.getItem(TRAINING_KEY))!);
    expect(stored[0].syncStatus).toBe('pending');
  });

  it('reports progress via callback', async () => {
    await setupPendingSample();

    const progress = jest.fn();
    await syncTrainingData({ onProgress: progress });

    expect(progress).toHaveBeenCalledWith(0);
    expect(progress).toHaveBeenCalledWith(100);
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('marks samples synced if server returns invalid JSON', async () => {
    await setupPendingSample();

    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('/train-model')) {
        return { ok: true, json: async () => { throw new Error('bad json'); } } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    await syncTrainingData();

    expect(logger.warn).toHaveBeenCalledWith(
      'failed to parse training response',
      expect.any(Error),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const updated = JSON.parse((await AsyncStorage.getItem(TRAINING_KEY))!);
    expect(updated[0].syncStatus).toBe('synced');
  });

  it('keeps samples pending when polling fails repeatedly', async () => {
    const original = setTimeout;
    // Execute timers immediately to avoid long waits
    (global as any).setTimeout = (fn: any) => {
      fn();
      return 0 as any;
    };

    await setupPendingSample();

    let polls = 0;
    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('/train-model')) {
        return { ok: true, json: async () => ({ jobId: '1' }) } as any;
      }
      polls += 1;
      return { ok: false, status: 500 } as any;
    });

    await syncTrainingData();

    (global as any).setTimeout = original;

    expect(polls).toBeGreaterThanOrEqual(3);
    expect(logger.warn).toHaveBeenCalledWith(
      'training sync failed',
      expect.any(Error),
    );
    const updated = JSON.parse((await AsyncStorage.getItem(TRAINING_KEY))!);
    expect(updated[0].syncStatus).toBe('pending');
  });
});
