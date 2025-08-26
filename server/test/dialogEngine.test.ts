import { getLLMSuggestions, LLMRequest } from '../src/services/dialogEngine';

describe('getLLMSuggestions', () => {
  const req: LLMRequest = {
    input: 'Hallo',
    context: [],
    language: 'de',
    age: 5,
  };

  const mockFetch = (value: unknown) => {
    (global as any).fetch = jest.fn().mockResolvedValue(value);
  };

  afterEach(() => {
    delete (global as any).fetch;
    delete process.env.OPENAI_API_KEY;
  });

  it('returns empty arrays when no API key is present', async () => {
    const res = await getLLMSuggestions(req);
    expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
  });

  describe('with API key', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test';
    });

    it('parses and returns suggestions from the API', async () => {
      mockFetch({
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
      mockFetch({
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

    it('returns empty arrays when response JSON parsing fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch({
        ok: true,
        json: async () => {
          throw new Error('invalid json');
        },
      });
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('returns empty arrays when API response is not ok', async () => {
      mockFetch({
        ok: false,
        status: 500,
      });
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
    });

    it('returns empty arrays when fetch throws an error', async () => {
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('network'));
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
    });
  });
});
