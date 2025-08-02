import { getLLMSuggestions } from '../../server/src/services/dialogEngine';

describe('Dialog Engine', () => {
  it('should return empty suggestions without an API key', async () => {
    const res = await getLLMSuggestions({
      input: 'hello',
      context: ['hi'],
      language: 'English',
      age: 4,
    });
    expect(res.nextWords.length).toBe(0);
    expect(res.caregiverPhrases.length).toBe(0);
  });
});