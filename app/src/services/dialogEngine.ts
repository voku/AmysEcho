import { Symbol } from '../../db/models';
import { loadOpenAIApiKey, loadBackendApiToken } from '../storage';
import { logger } from '../utils/logger';
import { APIRetryManager } from './APIRetryManager';
import { API_URL } from '../constants';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
// Prefer a small, fast model for suggestions
const MODEL = 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = 4000;
const OPENAI_MAX_TOKENS = 256;
const OPENAI_TEMPERATURE = 0.3;

// LLM Hint: Define a clear type for the expected JSON response from the LLM.
export type LLMSuggestionResponse = {
  nextWords: string[];
  caregiverPhrases: string[];
};

function safeParseSuggestions(obj: any): LLMSuggestionResponse {
  try {
    const nextWords = Array.isArray(obj?.nextWords)
      ? obj.nextWords.filter((x: any) => typeof x === 'string')
      : [];
    const caregiverPhrases = Array.isArray(obj?.caregiverPhrases)
      ? obj.caregiverPhrases.filter((x: any) => typeof x === 'string')
      : [];
    return { nextWords, caregiverPhrases };
  } catch {
    return { nextWords: [], caregiverPhrases: [] };
  }
}

// Deduplicate identical prompts within a short TTL window
type CacheEntry = { value: LLMSuggestionResponse; ts: number };
const suggestionCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 30_000; // 30s

// Lightweight client-side rate limiter (disabled by default)
let bucketCount = 0;
let bucketWindowStart = 0;
let RATE_LIMIT = Number(process.env['EXPO_PUBLIC_DIALOG_RATE_LIMIT'] || 0); // e.g., 10
let RATE_WINDOW_MS = Number(process.env['EXPO_PUBLIC_DIALOG_RATE_WINDOW_MS'] || 0); // e.g., 60_000

function checkRate(): boolean {
  if (!RATE_LIMIT || !RATE_WINDOW_MS) return true;
  const now = Date.now();
  if (now - bucketWindowStart > RATE_WINDOW_MS) {
    bucketWindowStart = now;
    bucketCount = 0;
  }
  if (bucketCount < RATE_LIMIT) {
    bucketCount++;
    return true;
  }
  return false;
}

function makeKey(input: string, context: string[], language: string, age: number): string {
  return `${language}|${age}|${input}|${context.join(',')}`;
}

// Test-only reset helper
export function __resetDialogEngineForTests() {
  suggestionCache.clear();
  bucketCount = 0;
  bucketWindowStart = 0;
}

export function __setDialogRateLimitForTests(limit: number, windowMs: number) {
  RATE_LIMIT = limit;
  RATE_WINDOW_MS = windowMs;
}

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
        const candidate = vocabulary[i];
        if (candidate) {
          result.push(candidate);
        }
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
  // Direct OpenAI fallback removed (project not live): use server /dialog only
  private async getLLMSuggestions({
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
      // Rate limit and cache
      if (!checkRate()) {
        logger.warn('Dialog suggestions rate-limited');
        return { nextWords: [], caregiverPhrases: [] };
      }
      const cacheKey = makeKey(input, context, language, age);
      const cached = suggestionCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.value;
      }

      const retry = new APIRetryManager();
      const response = await retry.executeWithRetry(async () => {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
        try {
          const res = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: MODEL,
              messages: [...this.history, { role: 'user', content: prompt }],
              response_format: { type: 'json_object' },
              temperature: OPENAI_TEMPERATURE,
              max_tokens: OPENAI_MAX_TOKENS,
            }),
            signal: controller.signal,
          });
          return res;
        } finally {
          clearTimeout(to);
        }
      }, 'dialogEngine');

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

      const content = (() => { try { return JSON.parse(messageContent); } catch { return {}; } })();
      const parsed: LLMSuggestionResponse = safeParseSuggestions(content);
      suggestionCache.set(cacheKey, { value: parsed, ts: Date.now() });
      return parsed;
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
    // No fallback to direct OpenAI
    return { nextWords: [], caregiverPhrases: [] };
  }
}

export const dialogEngine = new DialogEngine();
