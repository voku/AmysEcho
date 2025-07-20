import Module from 'module';
const requireFn = Module.createRequire(__filename);
const store: Record<string, string> = {};
const AsyncStorage = {
  async getItem(k: string) { return store[k] ?? null; },
  async setItem(k: string, v: string) { store[k] = v; }
};
(requireFn.cache as any)[requireFn.resolve('@react-native-async-storage/async-storage')] = { exports: { default: AsyncStorage, ...AsyncStorage } };

const { recordInteraction } = require('../src/services/adaptiveLearningService');

(async () => {
  let trigger = await recordInteraction('g1', true);
  if (trigger) throw new Error('triggered on success');
  for (let i = 0; i < 7; i++) await recordInteraction('g1', false);
  trigger = await recordInteraction('g1', false);
  if (!trigger) throw new Error('should trigger at low score');
  const scores = JSON.parse(store['gestureHealthScores']);
  if (scores['g1'] >= 70) throw new Error('score not lowered');
  console.log('record interaction ok');
})();
