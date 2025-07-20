import Module from 'module';
const requireFn = Module.createRequire(__filename);
(requireFn.cache as any)[requireFn.resolve('../src/storage')] = { exports: { loadOpenAIApiKey: async () => null } };
const { getLLMSuggestions } = require('../src/services/dialogService');

(async () => {
  const res = await getLLMSuggestions('hello');
  if (res.nextWords[0] !== 'Hi!' || !res.caregiverPhrases[0].includes('Ask')) {
    throw new Error('fallback hello failed');
  }
  const res2 = await getLLMSuggestions('drink');
  if (!res2.caregiverPhrases[0].includes('Try repeating drink')) {
    throw new Error('default fallback failed');
  }
  console.log('dialog service ok');
})();
