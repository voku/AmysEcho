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

  const { recordInteraction } = require('../src/services/adaptiveLearningService');
  (Module as any)._load = orig;

  let trigger = await recordInteraction('g1', true);
  if (trigger) {
    throw new Error('should not trigger on success');
  }
  for (let i = 0; i < 7; i++) {
    trigger = await recordInteraction('g1', false);
  }
  if (!trigger) {
    throw new Error('should trigger when score drops');
  }
  const scores = JSON.parse(store['gestureHealthScores']);
  if (scores['g1'] !== 65) {
    throw new Error('score not persisted correctly');
  }
  console.log('recordInteraction ok');
})();
