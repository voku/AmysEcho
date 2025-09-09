import { dialogEngine, __resetDialogEngineForTests, __setDialogRateLimitForTests } from '../../src/services/dialogEngine';

jest.mock('../../src/storage', () => ({
  loadOpenAIApiKey: jest.fn(async () => 'test-api-key'),
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

  it('returns empty arrays when no backend token available', async () => {
    (loadBackendApiToken as jest.Mock).mockResolvedValue(null);
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
});
