
// LLM: Strict schema and Responses API for dialog suggestions
import OpenAI from 'openai';
import { z } from 'zod';
import config from '../config/index.js';

export type LLMSuggestionResponse = {
  nextWords: string[];
  caregiverPhrases: string[];
};

const suggestionSchema = z.object({
  nextWords: z.array(z.string()).default([]),
  caregiverPhrases: z.array(z.string()).default([]),
});

export interface LLMRequest {
  input: string;
  context: string[];
  language: string;
  age: number;
}

// Retain existing interface name for backward compatibility within the codebase.
export interface LLMSuggestions {
  nextWords: string[];
  caregiverPhrases: string[];
}

function getApiKey(): string | undefined {
  // Prefer live env var to avoid stale cached config in tests/runtime
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (config.openaiApiKey) return config.openaiApiKey;
  try {
    // LLM Hint: The .openai-key file is documented in README.md. Replace with
    // secure storage when integrating into the mobile app.
    return require('fs').readFileSync('.openai-key', 'utf8').trim();
  } catch {
    return undefined;
  }
}

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_DIALOG_TIMEOUT_MS || 4000);
const OPENAI_MAX_TOKENS = Number(process.env.OPENAI_DIALOG_MAX_TOKENS || 256);
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_DIALOG_TEMPERATURE || 0.3);

// In-memory TTL cache for repeated suggestions
type CacheEntry = { value: LLMSuggestionResponse; ts: number };
const suggestionCache = new Map<string, CacheEntry>();
const getCacheTtlMs = () => Number(process.env.OPENAI_DIALOG_CACHE_TTL_MS || 30_000);
function makeKey(req: LLMRequest): string {
  const ctx = Array.isArray(req.context) ? req.context.join(',') : '';
  return `${req.language}|${req.age}|${req.input}|${ctx}`;
}

async function withTimeoutRetry<T>(fn: () => Promise<T>, timeoutMs: number, retries: number): Promise<T> {
  const attempt = async (i: number): Promise<T> => {
    let timer: any;
    const to = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('OpenAI request timed out')), timeoutMs);
    });
    try {
      const result = (await Promise.race([fn(), to])) as T;
      clearTimeout(timer);
      return result;
    } catch (err: any) {
      clearTimeout(timer);
      const msg = String(err?.message || err);
      const isRetryable =
        msg.includes('timed out') ||
        msg.includes('network') ||
        msg.includes('rate') ||
        msg.includes('500') ||
        msg.includes('503');
      if (i >= retries || !isRetryable) throw err;
      const delay = 150 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
      return attempt(i + 1);
    }
  };
  return attempt(0);
}

export async function getLLMSuggestions(req: LLMRequest): Promise<LLMSuggestionResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { nextWords: [], caregiverPhrases: [] };
  }
  const prompt = `A ${req.age}-year-old child who speaks ${req.language} just selected the word "${req.input}". The current context is [${req.context.join(', ')}]. Provide likely next words and helpful phrases for a caregiver.`;
  console.log('LLM Prompt:', prompt);
  try {
    const key = makeKey(req);
    const cached = suggestionCache.get(key);
    if (cached && Date.now() - cached.ts < getCacheTtlMs()) {
      return cached.value;
    }
    const openai = new OpenAI({ apiKey });
    const response = await withTimeoutRetry(
      () => openai.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          {
            role: 'user',
            content: `${prompt} Return a JSON object with two keys: "nextWords" and "caregiverPhrases".`,
          },
        ],
        temperature: OPENAI_TEMPERATURE,
        max_tokens: OPENAI_MAX_TOKENS,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'llm_suggestions',
            schema: {
              type: 'object',
              properties: {
                nextWords: { type: 'array', items: { type: 'string' } },
                caregiverPhrases: { type: 'array', items: { type: 'string' } },
              },
              required: ['nextWords', 'caregiverPhrases'],
              additionalProperties: false,
            },
            strict: true,
          },
        },
      } as any),
      OPENAI_TIMEOUT_MS,
      2
    );
    const output = response.choices[0]?.message?.content || '';
    const m = output.match(/\{[\s\S]*\}/);
    const toParse = m ? m[0] : output || '{}';
    const parsed = suggestionSchema.safeParse(JSON.parse(toParse));
    if (!parsed.success) throw parsed.error;
    const out = parsed.data as LLMSuggestionResponse;
    suggestionCache.set(key, { value: out, ts: Date.now() });
    return out;
  } catch (error) {
    console.error('LLM suggestion error:', error);
    return { nextWords: [], caregiverPhrases: [] };
  }
}
