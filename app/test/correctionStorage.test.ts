const store: Record<string, string> = {};
const CORRECTION_PROFILE_ID = 'profile-correction';
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
    store.activeProfileId = CORRECTION_PROFILE_ID;
    await logCorrection('gesture1');

    const trainingKey = `gestureTrainingData_${CORRECTION_PROFILE_ID}`;
    const trainingRaw = store[trainingKey];
    expect(trainingRaw).toBeTruthy();
    const training = JSON.parse(trainingRaw as string);
    expect(training).toHaveLength(1);
    expect(training[0].label).toBe('gesture1');
    expect(training[0].source).toBe('HIP_3');

    const logsKey = `interactionLogs_${CORRECTION_PROFILE_ID}`;
    const logsRaw = store[logsKey];
    expect(logsRaw).toBeTruthy();
    const logs = JSON.parse(logsRaw as string);
    expect(logs).toHaveLength(1);
    expect(logs[0].gestureDefinitionId).toBe('gesture1');
    expect(logs[0].wasSuccessful).toBe(true);
  });
});
