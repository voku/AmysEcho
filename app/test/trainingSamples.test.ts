const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));

import { saveTrainingSample, loadTrainingSampleCount, TrainingFrame } from '../src/storage';

describe('training sample persistence', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('saves samples and counts them', async () => {
    const frame: TrainingFrame = { landmarks: [[[1, 2, 3]]], handedness: ['Left'] } as any;
    await saveTrainingSample('g1', [frame]);
    await saveTrainingSample('g1', [frame]);
    const count = await loadTrainingSampleCount('g1');
    expect(count).toBe(2);
  });
});
