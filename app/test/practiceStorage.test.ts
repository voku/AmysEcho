const store: Record<string, string> = {};
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

import { saveTrainingSample, TrainingFrame } from '../src/storage';

describe('saveTrainingSample', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    mockCreate.mockClear();
  });

  it('stores samples with default HIP_2 source', async () => {
    await saveTrainingSample('gesture1', [] as TrainingFrame[]);
    const raw = store['gestureTrainingData_default'];
    expect(raw).toBeTruthy();
    const data = JSON.parse(raw as string);
    expect(data[0].source).toBe('HIP_2');
  });

  it('stores samples with HIP_4 source when specified', async () => {
    await saveTrainingSample('gesture1', [] as TrainingFrame[], 'HIP_4');
    const raw = store['gestureTrainingData_default'];
    expect(raw).toBeTruthy();
    const data = JSON.parse(raw as string);
    expect(data[0].source).toBe('HIP_4');
  });
});
