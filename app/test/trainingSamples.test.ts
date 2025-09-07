const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));

const mockCreate = jest.fn(async (cb: any) => cb({ gestureDefinition: {}, landmarkData: '', source: '', qualityScore: 1, frameMetadata: '', createdAt: new Date(), customSyncStatus: 'pending' }));

jest.mock('../db', () => ({
  database: {
    get: jest.fn(() => ({ create: mockCreate })),
    write: jest.fn(async (fn: any) => fn()),
  }
}));
jest.mock('../db/models', () => ({ GestureTrainingData: {} }));

import { saveTrainingSample, loadTrainingSampleCount, TrainingFrame } from '../src/storage';

describe('training sample persistence', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    createMock.mockClear();
  });

  it('saves samples and counts them', async () => {
    const frame: TrainingFrame = { landmarks: [[[1, 2, 3]]], handedness: ['Left'] } as any;
    await saveTrainingSample('g1', [frame]);
    await saveTrainingSample('g1', [frame]);
    const count = await loadTrainingSampleCount('g1');
    expect(count).toBe(2);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
