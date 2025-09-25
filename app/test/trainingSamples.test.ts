const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));

jest.mock('../src/services/trainingBundleQueue', () => ({
  enqueueTrainingBundle: jest.fn(async () => 'bundle-key'),
}));

import { saveTrainingSample, loadTrainingSampleCount, TrainingFrame, createTrainingSample } from '../src/storage';

describe('training sample persistence', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('saves samples and counts them', async () => {
    const frame: TrainingFrame = {
      landmarks: [
        [
          [1, 2, 3],
        ],
      ],
    };
    const sampleA = createTrainingSample({
      profileId: 'default',
      label: 'g1',
      frames: [frame],
      clipUri: 'file://clip.mp4',
    });
    const sampleB = createTrainingSample({
      profileId: 'default',
      label: 'g1',
      frames: [frame],
      clipUri: 'file://clip.mp4',
    });
    await saveTrainingSample(sampleA);
    await saveTrainingSample(sampleB);
    const count = await loadTrainingSampleCount('g1');
    expect(count).toBe(2);
  });
});
