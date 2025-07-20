const Module = require('module');

(async () => {
  const store: Record<string, string> = {};
  const stub = {
    async getItem(key: string) { return store[key] ?? null; },
    async setItem(key: string, value: string) { store[key] = value; }
  };
  const orig = (Module as any)._load;
  (Module as any)._load = (req: string, parent: any, isMain: boolean) => {
    if (req === '@react-native-async-storage/async-storage') {
      return stub;
    }
    return orig(req, parent, isMain);
  };

  const { incrementUsage, loadUsageStats } = require('../src/services/usageTracker');
  (Module as any)._load = orig;

  const entry = { id: 'hello', label: 'Hello' };
  await incrementUsage(entry, 'p1');
  await incrementUsage(entry, 'p1');
  await incrementUsage(entry, 'p2');

  const stats1 = await loadUsageStats('p1');
  const stats2 = await loadUsageStats('p2');
  if (stats1.hello !== 2 || stats2.hello !== 1) {
    throw new Error('usage stats incorrect');
  }
  console.log('usage tracker ok');
})();
