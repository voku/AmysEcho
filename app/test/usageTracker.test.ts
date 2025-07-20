import Module from 'module';
const requireFn = Module.createRequire(__filename);
const store: Record<string, string> = {};
const AsyncStorage = {
  async getItem(key: string) { return store[key] ?? null; },
  async setItem(key: string, value: string) { store[key] = value; }
};
(requireFn.cache as any)[requireFn.resolve('@react-native-async-storage/async-storage')] = { exports: { default: AsyncStorage, ...AsyncStorage } };

const { incrementUsage, loadUsageStats } = require('../src/services/usageTracker');

(async () => {
  const entry = { id: 'wave', label: 'Wave' };
  await incrementUsage(entry, 'p1');
  await incrementUsage(entry, 'p1');
  await incrementUsage(entry, 'p2');
  const stats1 = await loadUsageStats('p1');
  const stats2 = await loadUsageStats('p2');
  if (stats1.wave !== 2 || stats2.wave !== 1) {
    throw new Error('usage stats incorrect');
  }
  console.log('usage tracker ok');
})();
