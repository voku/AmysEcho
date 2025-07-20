import { getLLMSuggestions } from '../../server/src/services/dialogEngine';

(async () => {
  const res = await getLLMSuggestions({
    input: 'hello',
    context: ['hi'],
    language: 'English',
    age: 4,
  });
  if (res.nextWords.length !== 0 || res.caregiverPhrases.length !== 0) {
    throw new Error('Expected empty suggestions without API key');
  }
  console.log('dialog engine default ok');
})();
