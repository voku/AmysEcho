import { database } from '../db';
import { Symbol } from '../db/models';

// LLM Hint: Define a clear type for the expected JSON response from the LLM.
export type LLMSuggestionResponse = {
  nextWords: string[];
  caregiverPhrases: string[];
};

class DialogEngine {
  /**
   * Return adaptive suggestions based on last selected symbol.
   * Currently a simple placeholder using local vocabulary order.
   */
  public async getAdaptiveSuggestions(vocabulary: Symbol[], profileId: string, lastSymbol?: Symbol): Promise<Symbol[]> {
    try {
      // Simple heuristic: return the next few symbols after lastSymbol in the vocabulary list
      if (!lastSymbol) return vocabulary.slice(0, 3);
      const idx = vocabulary.findIndex(s => s.id === lastSymbol.id);
      const result = [] as Symbol[];
      for (let i = idx + 1; i < vocabulary.length && result.length < 3; i++) {
        result.push(vocabulary[i]);
      }
      return result;
    } catch {
      return [];
    }
  }

  /**
   * Request suggestions from the secure backend powered by the LLM.
   * @param input - currently selected symbol name
   * @param context - related context tags
   * @param language - language code (e.g., 'de')
   * @param age - user age (e.g., 4)
   * @returns { nextWords: string[], caregiverPhrases: string[] }
   */
  public async getLLMSuggestions({
    input,
    context,
    language,
    age,
  }: {
    input: string;
    context: string[];
    language: string;
    age: number;
  }): Promise<LLMSuggestionResponse> {
    // LLM Hint: This endpoint points to our secure backend proxy, NOT directly to OpenAI.
    const proxyUrl = 'https://your-secure-proxy-server.com/generate-suggestions';

    // LLM Hint: In a real app, this token would come from an authentication service.
    const authToken = 'user-session-jwt-token-placeholder';

    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          input,
          context,
          language,
          age,
        }),
      });

      if (!response.ok) {
        console.error(`API call failed with status: ${response.status}`);
        return { nextWords: [], caregiverPhrases: [] };
      }

      return (await response.json()) as LLMSuggestionResponse;
    } catch (error) {
      console.error('LLM suggestion fetch error:', error);
      return { nextWords: [], caregiverPhrases: [] }; // Return empty on error
    }
  }
}

export const dialogEngine = new DialogEngine();
