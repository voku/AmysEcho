import { Symbol } from '../../db/models';
import { loadOpenAIApiKey, loadBackendApiToken } from '../storage';
import { logger } from '../utils/logger';
import { APIRetryManager } from './APIRetryManager';
import { API_URL } from '../constants';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
// Prefer a small, fast model for short caregiver prompts
const MODEL = 'gpt-4.1-mini';
const OPENAI_TIMEOUT_MS = 4000;
const OPENAI_MAX_OUTPUT_TOKENS = 256;
const OPENAI_TEMPERATURE = 0.3;

const SUGGESTION_SCHEMA = {
  name: 'CaregiverSupportResponse',
  schema: {
    type: 'object',
    properties: {
      nextWords: {
        type: 'array',
        items: { type: 'string' },
        default: [],
      },
      caregiverPhrases: {
        type: 'array',
        items: { type: 'string' },
        default: [],
      },
    },
    required: ['nextWords', 'caregiverPhrases'],
    additionalProperties: false,
  },
  strict: true,
} as const;

interface OpenAIOutputTextBlock {
  type?: string;
  text?: string;
}

interface OpenAIOutputItem {
  content?: OpenAIOutputTextBlock[] | string;
}

interface OpenAIResponsePayload {
  output_text?: string;
  output?: OpenAIOutputItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseOpenAIResponse(raw: unknown): OpenAIResponsePayload {
  if (!isRecord(raw)) {
    return {};
  }

  const payload: OpenAIResponsePayload = {};
  const outputText = raw['output_text'];
  if (typeof outputText === 'string') {
    payload.output_text = outputText;
  }

  const output = raw['output'];
  if (Array.isArray(output)) {
    payload.output = output.map((item): OpenAIOutputItem => {
      if (!isRecord(item)) {
        return {};
      }
      const entry: OpenAIOutputItem = {};
      const content = item['content'];
      if (typeof content === 'string') {
        entry.content = content;
      } else if (Array.isArray(content)) {
        const blocks: OpenAIOutputTextBlock[] = [];
        for (const block of content) {
          if (!isRecord(block)) {
            continue;
          }
          const type = typeof block['type'] === 'string' ? (block['type'] as string) : undefined;
          const text = typeof block['text'] === 'string' ? (block['text'] as string) : undefined;
          if (type || text) {
            const blockEntry: OpenAIOutputTextBlock = {};
            if (type) {
              blockEntry.type = type;
            }
            if (text) {
              blockEntry.text = text;
            }
            blocks.push(blockEntry);
          }
        }
        if (blocks.length > 0) {
          entry.content = blocks;
        }
      }
      return entry;
    });
  }

  return payload;
}

function extractOutputText(data: OpenAIResponsePayload): string {
  if (typeof data.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text;
  }

  if (!Array.isArray(data.output)) {
    return '';
  }

  const parts = data.output
    .map((item) => {
      if (!item) {
        return '';
      }
      const { content } = item;
      if (typeof content === 'string') {
        return content;
      }
      if (Array.isArray(content)) {
        const block = content.find(
          (entry): entry is OpenAIOutputTextBlock =>
            Boolean(entry) && entry.type === 'output_text' && typeof entry.text === 'string',
        );
        return block?.text ?? '';
      }
      return '';
    })
    .filter((text) => typeof text === 'string' && text.trim().length > 0);

  return parts.join('\n');
}

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

type DialogRole = 'user' | 'assistant';

class DialogEngine {
  private history: { role: DialogRole; content: string }[] = [];

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
    _profileId: string,
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
    const apiKey = (await loadOpenAIApiKey())?.trim();
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
        const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
        try {
          const conversation: Array<{ role: 'system' | DialogRole; content: string }> = [
            {
              role: 'system',
              content:
                'Du bist Amys Kommunikations-Coach. Liefere nur JSON, das dem bereitgestellten Schema entspricht, ohne zusätzlichen Text.',
            },
            ...this.history,
            { role: 'user', content: prompt },
          ];

          const payload = {
            model: MODEL,
            input: conversation.map((message) => ({
              role: message.role,
              content: [
                {
                  type: 'input_text',
                  text: message.content,
                },
              ],
            })),
            temperature: OPENAI_TEMPERATURE,
            max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
            response_format: {
              type: 'json_schema',
              json_schema: SUGGESTION_SCHEMA,
            },
          };

          const res = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          return res;
        } finally {
          clearTimeout(timeout);
        }
      }, 'dialogEngine');

      if (!response.ok) {
        logger.error(`OpenAI API returned status ${response.status}`);
        return { nextWords: [], caregiverPhrases: [] };
      }

      const raw = await response.json();
      const data = parseOpenAIResponse(raw);
      const outputText = extractOutputText(data);

      const messageContent = typeof outputText === 'string' && outputText.trim().length > 0 ? outputText : '{}';

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
      } else {
        logger.debug('No backend token available for dialog suggestions; using OpenAI directly');
      }
    } catch (e) {
      logger.warn('Server /dialog request failed; falling back', e);
    }
    return this.getLLMSuggestions({ input, context, language, age });
  }
}

export const dialogEngine = new DialogEngine();
