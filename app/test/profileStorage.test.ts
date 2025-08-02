const records: any[] = [];
let nextId = 1;
const stubDb = {
  get: () => ({
    query: () => ({
      fetch: async () => records,
    }),
    create: async (fn: any) => {
      const rec: any = {
        id: 'p' + nextId++,
        name: '',
        consentHelpMeGetSmarter: false,
        consentHelpMeLearnOverTime: false,
        largeText: false,
        highContrast: false,
        activeVocabularySet: { id: '' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      fn(rec);
      records.push(rec);
      return rec;
    },
    find: async (id: string) => {
      const rec = records.find(r => r.id === id);
      if (!rec) throw new Error('not found');
      return rec;
    },
  }),
  write: async (fn: any) => fn(),
};

const store: Record<string, string> = {};
const stubAsync = {
  async getItem(key: string) { return store[key] ?? null; },
  async setItem(key: string, value: string) { store[key] = value; },
};
const stubSecure = {
  async getItemAsync(key: string) { return store[key] ?? null; },
  async setItemAsync(key: string, value: string) { store[key] = value; },
};

jest.mock('../db', () => ({ database: stubDb }));
jest.mock('../db/models', () => ({ Profile: class {} }));
jest.mock('@react-native-async-storage/async-storage', () => stubAsync);
jest.mock('expo-secure-store', () => stubSecure);

import { createProfile, loadProfile } from '../src/storage';

describe('Profile Storage', () => {
  it('should create and load a profile with accessibility flags', async () => {
    const created = await createProfile({
      name: 'Test',
      consentDataUpload: true,
      consentHelpMeGetSmarter: true,
      vocabularySetId: 'basic',
      largeText: true,
      highContrast: true,
    });

    const loaded = await loadProfile(created.id);

    expect(loaded?.largeText).toBe(true);
    expect(loaded?.highContrast).toBe(true);
  });
});
