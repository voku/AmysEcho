import { loadBackendApiToken } from '../storage';
import { logger } from '../utils/logger';
import { APIRetryManager } from './APIRetryManager';
import { API_URL } from '../constants';

export type LLMSuggestionResponse = {
  nextWords: string[];
  caregiverPhrases: string[];
};

type CacheEntry = { value: LLMSuggestionResponse; ts: number };
const suggestionCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 30_000; // 30s

let bucketCount = 0;
let bucketWindowStart = 0;
let RATE_LIMIT = Number(process.env['EXPO_PUBLIC_DIALOG_RATE_LIMIT'] || 0);
let RATE_WINDOW_MS = Number(process.env['EXPO_PUBLIC_DIALOG_RATE_WINDOW_MS'] || 0);

function checkRate(): boolean {
  if (!RATE_LIMIT || !RATE_WINDOW_MS) {
    return true;
  }
  const now = Date.now();
  if (now - bucketWindowStart > RATE_WINDOW_MS) {
    bucketWindowStart = now;
    bucketCount = 0;
  }
  if (bucketCount < RATE_LIMIT) {
    bucketCount += 1;
    return true;
  }
  return false;
}

function makeKey(input: string, context: string[], language: string, age: number): string {
  return `${language}|${age}|${input}|${context.join(',')}`;
}

function normalizeSuggestionPayload(obj: any): LLMSuggestionResponse {
  try {
    const nextWords = Array.isArray(obj?.nextWords)
      ? obj.nextWords.filter((item: any) => typeof item === 'string')
      : [];
    const caregiverPhrases = Array.isArray(obj?.caregiverPhrases)
      ? obj.caregiverPhrases.filter((item: any) => typeof item === 'string')
      : [];
    return { nextWords, caregiverPhrases };
  } catch {
    return { nextWords: [], caregiverPhrases: [] };
  }
}

function cloneResponse(value: LLMSuggestionResponse): LLMSuggestionResponse {
  return {
    nextWords: [...value.nextWords],
    caregiverPhrases: [...value.caregiverPhrases],
  };
}

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
  private readCache(key: string): LLMSuggestionResponse | null {
    const cached = suggestionCache.get(key);
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.ts > CACHE_TTL_MS) {
      suggestionCache.delete(key);
      return null;
    }
    return cloneResponse(cached.value);
  }

  private writeCache(key: string, value: LLMSuggestionResponse): void {
    suggestionCache.set(key, { value: cloneResponse(value), ts: Date.now() });
  }

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
    const cacheKey = makeKey(input, context, language, age);
    const cached = this.readCache(cacheKey);
    if (cached) {
      return cached;
    }

    if (!checkRate()) {
      logger.warn('Dialog suggestions rate-limited');
      return { nextWords: [], caregiverPhrases: [] };
    }

    const token = await loadBackendApiToken();
    if (!token) {
      logger.warn('No backend token configured for dialog suggestions');
      return { nextWords: [], caregiverPhrases: [] };
    }

    try {
      const retry = new APIRetryManager();
      const response = await retry.executeWithRetry(
        () =>
          fetch(`${API_URL}/dialog`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ input, context, language, age }),
          }),
        'serverDialog',
      );

      if (!response.ok) {
        logger.warn(`Server /dialog returned status ${response.status}`);
        return { nextWords: [], caregiverPhrases: [] };
      }

      const data = await response.json();
      const parsed = normalizeSuggestionPayload(data);
      this.writeCache(cacheKey, parsed);
      return parsed;
    } catch (error) {
      logger.warn('Server /dialog request failed', error);
      return { nextWords: [], caregiverPhrases: [] };
    }
  }
}

export const dialogEngine = new DialogEngine();
