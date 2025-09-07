const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => store[key] ?? null,
  setItem: async (key: string, value: string) => { store[key] = value; },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));
jest.mock('../db', () => ({ database: {} }));
jest.mock('../db/models', () => ({}));

import { logCorrection } from '../src/storage';

describe('logCorrection', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('stores correction samples and logs', async () => {
    await logCorrection('gesture1');

    const trainingRaw = store['gestureTrainingData'];
    expect(trainingRaw).toBeTruthy();
    const training = JSON.parse(trainingRaw as string);
    expect(training).toHaveLength(1);
    expect(training[0].gestureDefinitionId).toBe('gesture1');
    expect(training[0].source).toBe('HIP_3');

    const logsRaw = store['interactionLogs'];
    expect(logsRaw).toBeTruthy();
    const logs = JSON.parse(logsRaw as string);
    expect(logs).toHaveLength(1);
    expect(logs[0].gestureDefinitionId).toBe('gesture1');
    expect(logs[0].wasSuccessful).toBe(true);
  });
});
