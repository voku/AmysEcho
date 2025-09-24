import { getLLMSuggestions } from '../../server/src/services/dialogEngine';

const openaiMock = jest.requireMock('openai');

describe('Dialog Engine', () => {
  it('returns empty suggestions without an API key', async () => {
    const res = await getLLMSuggestions({
      input: 'hello',
      context: ['hi'],
      language: 'English',
      age: 4,
    });
    expect(res.nextWords).toEqual([]);
    expect(res.caregiverPhrases).toEqual([]);
  });

  it('constructs OpenAI chat request with context when API key present', async () => {
    openaiMock.__reset();
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';

    openaiMock.__setResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({ nextWords: ['foo'], caregiverPhrases: ['bar'] }),
          },
        },
      ],
    });

    const res = await getLLMSuggestions({
      input: 'wasser',
      context: ['ich', 'möchte'],
      language: 'German',
      age: 5,
    });

    const configs = openaiMock.__getConfigs();
    expect(configs[0]).toEqual({ apiKey: 'test-key' });
    expect(openaiMock.__createMock).toHaveBeenCalledTimes(1);
    const payload = openaiMock.__createMock.mock.calls[0][0];
    expect(payload.messages[0].content).toContain('wasser');
    expect(payload.messages[0].content).toContain('ich, möchte');
    expect(res.nextWords).toEqual(['foo']);
    expect(res.caregiverPhrases).toEqual(['bar']);

    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
