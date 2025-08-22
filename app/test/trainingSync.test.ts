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

jest.mock('@react-native-community/netinfo', () => ({
  fetch: async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
}));

jest.mock('../src/storage', () => ({
  loadProfile: async () => ({ consentHelpMeGetSmarter: true }),
  loadBackendApiToken: async () => 'token',
}));

import { syncTrainingData } from '../src/services/trainingSync';

const TRAINING_KEY = 'gestureTrainingData';

describe('syncTrainingData', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    (global as any).fetch = jest.fn(async () => ({ ok: true }));
  });

  it('uploads pending samples with labels', async () => {
    store[TRAINING_KEY] = JSON.stringify([
      { id: '1', gestureDefinitionId: 'g1', landmarkData: [1, 2, 3], source: 'HIP_2', syncStatus: 'pending' },
    ]);

    await syncTrainingData();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.samples[0].gestureDefinitionId).toBe('g1');
    expect(body.samples[0].landmarkData).toEqual([1, 2, 3]);
    const updated = JSON.parse(store[TRAINING_KEY]);
    expect(updated[0].syncStatus).toBe('synced');
  });
});
