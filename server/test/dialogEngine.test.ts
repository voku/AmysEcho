import { getLLMSuggestions, LLMRequest } from '../src/services/dialogEngine';

// Mock OpenAI SDK
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }));
});

describe('getLLMSuggestions', () => {
  const req: LLMRequest = {
    input: 'Hallo',
    context: [],
    language: 'de',
    age: 5,
  };

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('returns empty arrays when no API key is present', async () => {
    const res = await getLLMSuggestions(req);
    expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
  });

  describe('with API key', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test';
      process.env.OPENAI_DIALOG_CACHE_TTL_MS = '0'; // Disable caching for tests
      mockCreate.mockReset();
    });

    it('parses and returns suggestions from the API', async () => {
      mockCreate.mockImplementation(() => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ nextWords: ['tschüss'], caregiverPhrases: ['Wie geht es dir?'] }) } }],
      }));
      const res = await getLLMSuggestions(req);
      expect(res.nextWords).toContain('tschüss');
      expect(res.caregiverPhrases).toContain('Wie geht es dir?');
    });

    it('returns empty arrays on invalid API response', async () => {
      mockCreate.mockImplementation(() => Promise.resolve({
        choices: [{ message: { content: '{"foo": "bar"}' } }],
      }));
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
    });

    it('returns empty arrays when response JSON parsing fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockCreate.mockImplementation(() => Promise.resolve({
        choices: [{ message: { content: 'Invalid JSON [[[ ' } }],
      }));
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('returns empty arrays when API response is not ok', async () => {
      mockCreate
        .mockImplementationOnce(() => Promise.reject(new Error('500')))
        .mockImplementationOnce(() => Promise.reject(new Error('500')))
        .mockImplementationOnce(() => Promise.reject(new Error('500')));
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('returns empty arrays when fetch throws an error', async () => {
      mockCreate
        .mockImplementationOnce(() => Promise.reject(new Error('network')))
        .mockImplementationOnce(() => Promise.reject(new Error('network')))
        .mockImplementationOnce(() => Promise.reject(new Error('network')));
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('retries on 500 and succeeds on next attempt', async () => {
      mockCreate
        .mockImplementationOnce(() => Promise.reject(new Error('500')))
        .mockImplementationOnce(() => Promise.resolve({
          choices: [{ message: { content: JSON.stringify({ nextWords: ['ja'], caregiverPhrases: ['gut gemacht'] }) } }],
        }));
      const res = await getLLMSuggestions(req);
      expect(res.nextWords).toContain('ja');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it.skip('caches identical requests within TTL', async () => {
      // Temporarily enable caching for this test
      process.env.OPENAI_DIALOG_CACHE_TTL_MS = '30000';
      mockCreate.mockImplementation(() => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ nextWords: ['ok'], caregiverPhrases: ['super'] }) } }],
      }));

      const a = await getLLMSuggestions(req);
      const b = await getLLMSuggestions(req);
      expect(a.nextWords).toContain('ok');
      expect(b.nextWords).toContain('ok');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
});
