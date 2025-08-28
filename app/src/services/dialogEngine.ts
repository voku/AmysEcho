import { Symbol } from '../../db/models';
import { loadOpenAIApiKey, loadBackendApiToken } from '../storage';
import { logger } from '../utils/logger';
import { APIRetryManager } from './APIRetryManager';
import { API_URL } from '../constants';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4-turbo';

// LLM Hint: Define a clear type for the expected JSON response from the LLM.
import { LLMSuggestionResponse } from '../types';

class DialogEngine {
  private history: { role: 'user' | 'assistant'; content: string }[] = [];

  /**
   * Reset the stored conversation history. Useful for new sessions
   * or when switching profiles.
   */
  public resetHistory() {
    this.history = [];
  }
  /**
   * Return adaptive suggestions based on last selected symbol.
   * Currently a simple placeholder using local vocabulary order.
   */
  public async getAdaptiveSuggestions(
    vocabulary: Symbol[],
    profileId: string,
    lastSymbol?: Symbol,
  ): Promise<Symbol[]> {
    try {
      // Simple heuristic: return the next few symbols after lastSymbol in the vocabulary list
      if (!lastSymbol) return vocabulary.slice(0, 3);
      const idx = vocabulary.findIndex((s) => s.id === lastSymbol.id);
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
      const retry = new APIRetryManager();
      const response = await retry.executeWithRetry(() =>
        fetch(OPENAI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [...this.history, { role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.7,
          }),
        }),
        'dialogEngine'
      );

      if (!response.ok) {
        logger.error(`OpenAI API returned status ${response.status}`);
        return { nextWords: [], caregiverPhrases: [] };
      }

      const data = await response.json();
      const messageContent = data.choices?.[0]?.message?.content || '{}';

      // Update conversation history with the latest exchange
      this.history.push({ role: 'user', content: prompt });
      this.history.push({ role: 'assistant', content: messageContent });
      if (this.history.length > 10) {
        this.history = this.history.slice(-10);
      }

      const content = JSON.parse(messageContent);
      return {
        nextWords: content.nextWords || [],
        caregiverPhrases: content.caregiverPhrases || [],
      } as LLMSuggestionResponse;
    } catch (error) {
      logger.error('LLM suggestion fetch error:', error);
      return { nextWords: [], caregiverPhrases: [] };
    }
  }

  /**
   * Request suggestions from the server `/dialog` endpoint (preferred),
   * falling back to direct OpenAI call when no backend token is available.
   */
  public async getSuggestions({
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
    try {
      const token = await loadBackendApiToken();
      if (token) {
        const retry = new APIRetryManager();
        const response = await retry.executeWithRetry(() =>
          fetch(`${API_URL}/dialog`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ input, context, language, age }),
          }),
          'serverDialog'
        );
        if (response.ok) {
          const data = await response.json();
          return {
            nextWords: Array.isArray(data.nextWords) ? data.nextWords : [],
            caregiverPhrases: Array.isArray(data.caregiverPhrases)
              ? data.caregiverPhrases
              : [],
          };
        }
        logger.warn(`Server /dialog returned status ${response.status}; falling back`);
      }
    } catch (e) {
      logger.warn('Server /dialog request failed; falling back', e);
    }
    // Fallback to direct OpenAI call if available
    return this.getLLMSuggestions({ input, context, language, age });
  }
}

export const dialogEngine = new DialogEngine();
