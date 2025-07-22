import Module from 'module';

(async () => {
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

  const origLoad = (Module as any)._load;
  (Module as any)._load = (req: string, parent: any, isMain: boolean) => {
    if (req === '../db') {
      return { database: stubDb };
    }
    if (req === '../db/models') {
      return { Profile: class {} };
    }
    if (req === '@react-native-async-storage/async-storage') {
      return stubAsync;
    }
    if (req === 'expo-secure-store') {
      return stubSecure;
    }
    return origLoad(req, parent, isMain);
  };

  const { createProfile, loadProfile } = require('../src/storage');

  const created = await createProfile({
    name: 'Test',
    consentDataUpload: true,
    consentHelpMeGetSmarter: true,
    vocabularySetId: 'basic',
    largeText: true,
    highContrast: true,
  });

  const loaded = await loadProfile(created.id);

  (Module as any)._load = origLoad;

  if (!loaded?.largeText || !loaded?.highContrast) {
    throw new Error('accessibility flags not persisted');
  }

  console.log('profile storage ok');
})();
