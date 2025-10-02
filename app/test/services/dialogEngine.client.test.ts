import { dialogEngine, __resetDialogEngineForTests, __setDialogRateLimitForTests } from '../../src/services/dialogEngine';

jest.mock('../../src/storage', () => ({
  loadOpenAIApiKey: jest.fn(async () => null),
  loadBackendApiToken: jest.fn(async () => null),
}));

describe('Client DialogEngine (server /dialog only)', () => {
  const { loadOpenAIApiKey, loadBackendApiToken } = require('../../src/storage');

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    // Reset internal rate limit bucket
    delete process.env.EXPO_PUBLIC_DIALOG_RATE_LIMIT;
    delete process.env.EXPO_PUBLIC_DIALOG_RATE_WINDOW_MS;
    __resetDialogEngineForTests();
    __setDialogRateLimitForTests(0, 0);
  });

  it('returns empty arrays when no backend token or OpenAI key available', async () => {
    (loadBackendApiToken as jest.Mock).mockResolvedValue(null);
    (loadOpenAIApiKey as jest.Mock).mockResolvedValue(null);
    const res = await dialogEngine.getSuggestions({ input: 'Hallo', context: [], language: 'de', age: 5 });
    expect(res).toEqual({ nextWords: [], caregiverPhrases: [] });
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('uses server /dialog when backend token is available', async () => {
    (loadBackendApiToken as jest.Mock).mockResolvedValue('token');
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ nextWords: ['bitte'], caregiverPhrases: ['prima'] }),
    });

    const res = await dialogEngine.getSuggestions({ input: 'Hallo', context: [], language: 'de', age: 5 });
    expect(res.nextWords).toContain('bitte');
    // only one fetch to server; no OpenAI call path in this test
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('calls OpenAI responses API when API key is set and server token missing', async () => {
    (loadBackendApiToken as jest.Mock).mockResolvedValue(null);
    (loadOpenAIApiKey as jest.Mock).mockResolvedValue('test-api-key');
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({ nextWords: ['bitte'], caregiverPhrases: ['toll gemacht'] }),
      }),
    });

    const res = await dialogEngine.getSuggestions({ input: 'Hallo', context: ['spielen'], language: 'de', age: 5 });

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(JSON.parse(init.body).model).toBe('gpt-4.1-mini');
    expect(res.nextWords).toContain('bitte');
    expect(res.caregiverPhrases).toContain('toll gemacht');
  });
});
