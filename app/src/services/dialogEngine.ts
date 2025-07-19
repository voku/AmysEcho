import { database } from '../db';
import { Symbol } from '../db/models';
import { loadBackendApiToken } from '../storage';

const BACKEND_URL = 'http://localhost:5000/generate-suggestions';

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
   * Request suggestions from the secure backend API.
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
    const token = await loadBackendApiToken();
    if (!token) {
      return { nextWords: [], caregiverPhrases: [] };
    }

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ input, context, language, age }),
      });

      if (!response.ok) {
        console.error(`Backend API returned status ${response.status}`);
        return { nextWords: [], caregiverPhrases: [] };
      }

      const data = await response.json();
      return {
        nextWords: data.nextWords || [],
        caregiverPhrases: data.caregiverPhrases || [],
      } as LLMSuggestionResponse;
    } catch (error) {
      console.error('LLM suggestion fetch error:', error);
      return { nextWords: [], caregiverPhrases: [] };
    }
  }
}

export const dialogEngine = new DialogEngine();
