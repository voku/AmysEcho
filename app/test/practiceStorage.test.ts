const store: Record<string, string> = {};
const PRACTICE_PROFILE_ID = 'profile-practice';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));

const mockCreate = jest.fn(async (cb: any) => cb({ gestureDefinition: {} }));
jest.mock('../db', () => ({
  database: {
    get: jest.fn(() => ({ create: mockCreate })),
    write: jest.fn(async (fn: any) => fn()),
  },
}));

jest.mock('../db/models', () => ({}));

jest.mock('../src/services/trainingBundleQueue', () => ({
  __esModule: true,
  enqueueTrainingBundle: jest.fn(async () => 'bundle-key'),
}));

import { saveTrainingSample, TrainingFrame, createTrainingSample } from '../src/storage';

describe('saveTrainingSample', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    mockCreate.mockClear();
  });

  it('stores samples with default HIP_2 source', async () => {
    const sample = createTrainingSample({
      profileId: PRACTICE_PROFILE_ID,
      label: 'gesture1',
      frames: [] as TrainingFrame[],
      clipUri: 'file://clip.mp4',
    });
    const storedSample = await saveTrainingSample(sample);
    const raw = store[`gestureTrainingData_${PRACTICE_PROFILE_ID}`];
    expect(raw).toBeTruthy();
    const data = JSON.parse(raw as string);
    expect(data[0].source).toBe('HIP_2');
    const queue = require('../src/services/trainingBundleQueue');
    expect(queue.enqueueTrainingBundle).toHaveBeenCalled();
    expect(storedSample.syncStatus).toBe('queued');
    expect(storedSample.clipUri).toBe('file://clip.mp4');
  });

  it('stores samples with HIP_4 source when specified', async () => {
    const sample = createTrainingSample({
      profileId: PRACTICE_PROFILE_ID,
      label: 'gesture1',
      frames: [] as TrainingFrame[],
      clipUri: 'file://clip.mp4',
      source: 'HIP_4',
    });
    await saveTrainingSample(sample);
    const raw = store[`gestureTrainingData_${PRACTICE_PROFILE_ID}`];
    expect(raw).toBeTruthy();
    const data = JSON.parse(raw as string);
    expect(data[0].source).toBe('HIP_4');
  });
});
