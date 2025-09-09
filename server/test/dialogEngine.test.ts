import { getLLMSuggestions, LLMRequest } from '../src/services/dialogEngine';

// Mock OpenAI SDK
jest.mock('openai', () => {
  const responses = { create: jest.fn() };
  return jest.fn().mockImplementation(() => ({ responses }));
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
      const OpenAIMock = require('openai');
      const shared = new OpenAIMock();
      // Reset the shared responses mock between tests
      if (shared && shared.responses && shared.responses.create) {
        shared.responses.create.mockReset();
      }
    });

    it('parses and returns suggestions from the API', async () => {
      const OpenAIMock = require('openai');
      const mockOpenAI = new OpenAIMock();
      mockOpenAI.responses.create.mockResolvedValue({
        output_text: JSON.stringify({ nextWords: ['tschüss'], caregiverPhrases: ['Wie geht es dir?'] }),
      });
      const res = await getLLMSuggestions(req);
      expect(res.nextWords).toContain('tschüss');
      expect(res.caregiverPhrases).toContain('Wie geht es dir?');
    });

    it('returns empty arrays on invalid API response', async () => {
      const OpenAIMock = require('openai');
      const mockOpenAI = new OpenAIMock();
      mockOpenAI.responses.create.mockResolvedValue({ output_text: '{"foo": "bar"}' });
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
    });

    it('returns empty arrays when response JSON parsing fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const OpenAIMock = require('openai');
      const mockOpenAI = new OpenAIMock();
      mockOpenAI.responses.create.mockResolvedValue({ output_text: 'Invalid JSON [[[ ' });
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('returns empty arrays when API response is not ok', async () => {
      const OpenAIMock = require('openai');
      const mockOpenAI = new OpenAIMock();
      mockOpenAI.responses.create
        .mockRejectedValueOnce(new Error('500'))
        .mockRejectedValueOnce(new Error('500'))
        .mockRejectedValueOnce(new Error('500'));
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
      expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(3);
    });

    it('returns empty arrays when fetch throws an error', async () => {
      const OpenAIMock = require('openai');
      const mockOpenAI = new OpenAIMock();
      mockOpenAI.responses.create
        .mockRejectedValueOnce(new Error('network'))
        .mockRejectedValueOnce(new Error('network'))
        .mockRejectedValueOnce(new Error('network'));
      const res = await getLLMSuggestions(req);
      expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
      expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(3);
    });

    it('retries on 500 and succeeds on next attempt', async () => {
      const OpenAIMock = require('openai');
      const mockOpenAI = new OpenAIMock();
      mockOpenAI.responses.create
        .mockRejectedValueOnce(new Error('500'))
        .mockResolvedValueOnce({ output_text: JSON.stringify({ nextWords: ['ja'], caregiverPhrases: ['gut gemacht'] }) });
      const res = await getLLMSuggestions(req);
      expect(res.nextWords).toContain('ja');
      expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(2);
    });

    it('caches identical requests within TTL', async () => {
      const OpenAIMock = require('openai');
      const mockOpenAI = new OpenAIMock();
      mockOpenAI.responses.create.mockResolvedValue({
        output_text: JSON.stringify({ nextWords: ['ok'], caregiverPhrases: ['super'] }),
      });

      const a = await getLLMSuggestions(req);
      const b = await getLLMSuggestions(req);
      expect(a.nextWords).toContain('ok');
      expect(b.nextWords).toContain('ok');
      expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(1);
    });
  });
});
