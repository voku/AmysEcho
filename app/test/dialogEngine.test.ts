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

  it('uses context to fetch and parse suggestions', async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const mockFetch = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  nextWords: ['foo'],
                  caregiverPhrases: ['bar'],
                }),
              },
            },
          ],
        }),
      } as any);

    const res = await getLLMSuggestions({
      input: 'water',
      context: ['want', 'some'],
      language: 'English',
      age: 4,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
    expect(body.messages[0].content).toContain('water');
    expect(body.messages[0].content).toContain('want, some');
    expect(res.nextWords).toEqual(['foo']);
    expect(res.caregiverPhrases).toEqual(['bar']);

    mockFetch.mockRestore();
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });
});