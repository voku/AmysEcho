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
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));

const createMock = jest.fn(async (cb: any) => cb({ gestureDefinition: {}, landmarkData: '', source: '', qualityScore: 1, frameMetadata: '', createdAt: new Date(), customSyncStatus: 'pending' }));
const dbMock = {
  get: jest.fn(() => ({ create: createMock })),
  write: jest.fn(async (fn: any) => fn()),
};

jest.mock('../db', () => ({ database: dbMock }));
jest.mock('../db/models', () => ({ GestureTrainingData: {} }));

import { saveTrainingSample, loadTrainingSampleCount } from '../src/storage';

describe('training sample persistence', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    createMock.mockClear();
  });

  it('saves samples and counts them', async () => {
    await saveTrainingSample('g1', [1, 2, 3]);
    await saveTrainingSample('g1', [4, 5, 6]);
    const count = await loadTrainingSampleCount('g1');
    expect(count).toBe(2);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
