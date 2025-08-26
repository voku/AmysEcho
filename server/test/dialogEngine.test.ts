import { getLLMSuggestions, LLMRequest } from '../src/services/dialogEngine';

describe('getLLMSuggestions', () => {
  const req: LLMRequest = {
    input: 'Hallo',
    context: [],
    language: 'de',
    age: 5,
  };

  afterEach(() => {
    delete (global as any).fetch;
    delete process.env.OPENAI_API_KEY;
  });

  it('returns empty arrays when no API key is present', async () => {
    const res = await getLLMSuggestions(req);
    expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
  });

  it('parses and returns suggestions from the API', async () => {
    process.env.OPENAI_API_KEY = 'test';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                nextWords: ['tschüss'],
                caregiverPhrases: ['Wie geht es dir?'],
              }),
            },
          },
        ],
      }),
    });
    const res = await getLLMSuggestions(req);
    expect(res.nextWords).toContain('tschüss');
    expect(res.caregiverPhrases).toContain('Wie geht es dir?');
  });

  it('returns empty arrays on invalid API response', async () => {
    process.env.OPENAI_API_KEY = 'test';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '{"foo": "bar"}' } },
        ],
      }),
    });
    const res = await getLLMSuggestions(req);
    expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
  });
});
