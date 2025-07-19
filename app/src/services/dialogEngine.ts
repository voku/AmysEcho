import { database } from '../db';
import { Symbol } from '../db/models';
import { loadOpenAIApiKey } from '../storage';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4-turbo';

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
   * Request suggestions directly from the OpenAI API.
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
    const apiKey = await loadOpenAIApiKey();
    if (!apiKey) {
      return { nextWords: [], caregiverPhrases: [] };
    }

    const prompt = `A ${age}-year-old child who speaks ${language} just selected the word "${input}". The current context is [${context.join(', ')}]. Provide likely next words and helpful phrases for a caregiver. Return a JSON object with the keys \"nextWords\" and \"caregiverPhrases\".`;

    try {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        console.error(`OpenAI API returned status ${response.status}`);
        return { nextWords: [], caregiverPhrases: [] };
      }

      const data = await response.json();
      const content = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      return {
        nextWords: content.nextWords || [],
        caregiverPhrases: content.caregiverPhrases || [],
      } as LLMSuggestionResponse;
    } catch (error) {
      console.error('LLM suggestion fetch error:', error);
      return { nextWords: [], caregiverPhrases: [] };
    }
  }
}

export const dialogEngine = new DialogEngine();
