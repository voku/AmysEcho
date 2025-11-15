/**
 * OpenAI Vision Service for Gesture Validation
 *
 * Uses GPT-4 Vision to analyze gesture images and provide:
 * - Secondary gesture validation when MediaPipe confidence is low
 * - Detailed feedback on gesture quality and form
 * - Fallback recognition for challenging gestures
 * - Learning insights for new gesture patterns
 */

import OpenAI from 'openai';
import { z } from 'zod';

export class OpenAIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIConfigurationError';
  }
}

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIConfigurationError('OpenAI API key is not configured');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }

  return openaiClient;
}

// Configurable model and safety limits
const DEFAULT_VISION_MODELS = ['gpt-5.1', 'gpt-4.1'];
const configuredVisionModels = process.env.OPENAI_VISION_MODEL
  ? process.env.OPENAI_VISION_MODEL.split(',').map((model) => model.trim()).filter(Boolean)
  : DEFAULT_VISION_MODELS;
const VISION_MODELS = configuredVisionModels.length > 0 ? configuredVisionModels : DEFAULT_VISION_MODELS;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 1500);
const OPENAI_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || 1000);
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE || 0.1);

// Validation schemas
const GestureValidationSchema = z.object({
  gesture: z.string(),
  confidence: z.number().min(0).max(1),
  feedback: z.string(),
  quality_score: z.number().min(0).max(10),
  suggestions: z.array(z.string()).optional(),
  landmarks_detected: z.boolean(),
  hand_count: z.number().min(0).max(2),
  contextual_meaning: z.string().optional(),
  reference_sources: z.array(z.string()).optional(),
});

const ServiceStatusSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  detail: z.string().optional(),
  checked_at: z.number().optional(),
  model: z.string().optional(),
});

const RawValidationResultSchema = z.object({
  primary_gesture: GestureValidationSchema,
  alternative_gestures: z.array(GestureValidationSchema).optional(),
  overall_confidence: z.number().min(0).max(1),
  processing_time_ms: z.number().optional(),
});

export type GestureValidation = z.infer<typeof GestureValidationSchema>;
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;
export type ValidationResult = z.infer<typeof RawValidationResultSchema> & {
  service_status: ServiceStatus;
};

export interface GestureValidationRequest {
  imageBase64: string;
  expectedGesture?: string;
  context?: {
    user_id?: string;
    session_id?: string;
    previous_gestures?: string[];
    environment?: 'home' | 'school' | 'therapy';
  };
  options?: {
    detailed_feedback?: boolean;
    include_alternatives?: boolean;
    confidence_threshold?: number;
  };
}

type GestureMeaningHint = {
  summary: string;
  sources?: string[];
  refinedMeaning?: string;
  refinedSources?: string[];
};

const gestureMeaningCache = new Map<string, GestureMeaningHint>();

export function __clearGestureMeaningCacheForTests() {
  gestureMeaningCache.clear();
}

function normalizeGestureKey(name: string | undefined): string | null {
  if (!name || typeof name !== 'string') {
    return null;
  }
  return name.normalize('NFKC').trim().toLowerCase();
}

function isMeaningInformative(meaning?: string): boolean {
  if (!meaning) {
    return false;
  }
  const text = meaning.trim();
  if (text.length < 18) {
    return false;
  }
  const lower = text.toLowerCase();
  if (lower.includes('nicht sicher') || lower.includes('unbekannt')) {
    return false;
  }
  const wordCount = text.split(/\s+/).length;
  return wordCount >= 4;
}

async function fetchGestureMeaningFromWeb(
  gestureName: string,
  expectedGesture?: string
): Promise<GestureMeaningHint | null> {
  const normalized = normalizeGestureKey(gestureName);
  if (!normalized) {
    return null;
  }

  if (gestureMeaningCache.has(normalized)) {
    return gestureMeaningCache.get(normalized)!;
  }

  if (typeof fetch !== 'function') {
    return null;
  }

  const queryTerms = [`DGS ${gestureName}`];
  if (expectedGesture && expectedGesture !== gestureName) {
    queryTerms.push(expectedGesture);
  }

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(queryTerms.join(' '))}&format=json&no_redirect=1&no_html=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AmysEcho/1.0 (+https://amys-echo.invalid)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data: any = await response.json();
    const textCandidate =
      (typeof data?.AbstractText === 'string' && data.AbstractText.trim().length > 0
        ? data.AbstractText.trim()
        : undefined) ??
      (Array.isArray(data?.RelatedTopics)
        ? data.RelatedTopics.map((topic: any) => topic?.Text).find(
            (entry: any) => typeof entry === 'string' && entry.trim().length > 0
          )?.trim()
        : undefined);

    if (!textCandidate) {
      return null;
    }

    const sanitized = textCandidate.replace(/\s+/g, ' ').trim();
    const sourceUrl =
      (typeof data?.AbstractURL === 'string' && data.AbstractURL.length > 0
        ? data.AbstractURL
        : undefined) ??
      (Array.isArray(data?.RelatedTopics)
        ? data.RelatedTopics.map((topic: any) => topic?.FirstURL).find(
            (entry: any) => typeof entry === 'string' && entry.length > 0
          )
        : undefined);

    const hint: GestureMeaningHint = {
      summary: sanitized,
      sources: sourceUrl ? [sourceUrl] : undefined,
    };

    gestureMeaningCache.set(normalized, hint);
    return hint;
  } catch (error) {
    console.warn('Failed to fetch external DGS meaning', error);
    return null;
  }
}

async function ensureGestureMeaning(
  gesture: GestureValidation,
  expectedGesture: string | undefined,
  refinement: { client: OpenAI; model: string | null }
): Promise<void> {
  if (!gesture) {
    return;
  }

  const existingMeaning = gesture.contextual_meaning;
  if (isMeaningInformative(existingMeaning)) {
    if (!Array.isArray(gesture.reference_sources)) {
      gesture.reference_sources = [];
    }
    return;
  }

  const attempted: Set<string> = new Set();
  const candidates = [gesture.gesture, expectedGesture].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
  );

  for (const candidate of candidates) {
    const normalized = normalizeGestureKey(candidate);
    if (!normalized || attempted.has(normalized)) {
      continue;
    }
    attempted.add(normalized);

    const cached = gestureMeaningCache.get(normalized);
    if (cached?.refinedMeaning) {
      gesture.contextual_meaning = cached.refinedMeaning;
      const combinedSources = new Set<string>([
        ...(cached.refinedSources ?? []),
        ...(cached.sources ?? []),
      ]);
      gesture.reference_sources = Array.from(combinedSources);
      return;
    }

    if (cached) {
      gesture.contextual_meaning = cached.summary;
      gesture.reference_sources = cached.sources ? [...cached.sources] : [];

      if (refinement.model) {
        const refined = await refineMeaningWithOpenAI({
          client: refinement.client,
          model: refinement.model,
          gestureName: gesture.gesture,
          expectedGesture,
          searchSummary: cached.summary,
          baseSources: cached.sources ?? [],
          existingMeaning,
        });

        if (refined) {
          gesture.contextual_meaning = refined.summary;
          gesture.reference_sources = refined.sources ? [...refined.sources] : [];
          gestureMeaningCache.set(normalized, {
            summary: cached.summary,
            sources: cached.sources,
            refinedMeaning: refined.summary,
            refinedSources: refined.sources,
          });
          return;
        }
      }

      return;
    }

    const fetched = await fetchGestureMeaningFromWeb(candidate, expectedGesture);
    if (fetched) {
      gesture.contextual_meaning = fetched.summary;
      gesture.reference_sources = fetched.sources ? [...fetched.sources] : [];

      gestureMeaningCache.set(normalized, fetched);

      if (refinement.model) {
        const refined = await refineMeaningWithOpenAI({
          client: refinement.client,
          model: refinement.model,
          gestureName: gesture.gesture,
          expectedGesture,
          searchSummary: fetched.summary,
          baseSources: fetched.sources ?? [],
          existingMeaning,
        });

        if (refined) {
          gesture.contextual_meaning = refined.summary;
          gesture.reference_sources = refined.sources ? [...refined.sources] : [];
          gestureMeaningCache.set(normalized, {
            summary: fetched.summary,
            sources: fetched.sources,
            refinedMeaning: refined.summary,
            refinedSources: refined.sources,
          });
        }
      }

      return;
    }
  }

  const fallbackMeaning =
    typeof existingMeaning === 'string' && existingMeaning.trim().length > 0
      ? existingMeaning
      : 'Keine zusätzlichen Informationen gefunden. Bitte im DGS-Lexikon oder online nachsehen.';

  gesture.contextual_meaning = fallbackMeaning;
  gesture.reference_sources = Array.isArray(gesture.reference_sources)
    ? gesture.reference_sources
    : [];
}

/**
 * Analyze gesture image using OpenAI Vision
 */
export async function validateGestureWithVision(
  request: GestureValidationRequest
): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    const client = getOpenAIClient();
    const { validationResult, modelUsed } = await performVisionAnalysis(client, request);

    await ensureGestureMeaning(validationResult.primary_gesture, request.expectedGesture, {
      client,
      model: modelUsed,
    });
    if (Array.isArray(validationResult.alternative_gestures)) {
      for (const alt of validationResult.alternative_gestures) {
        await ensureGestureMeaning(alt, request.expectedGesture, {
          client,
          model: modelUsed,
        });
      }
    }

    validationResult.processing_time_ms = Math.max(1, Date.now() - startTime);
    return {
      ...validationResult,
      service_status: {
        available: true,
        checked_at: Date.now(),
        model: modelUsed ?? undefined,
      },
    };
  } catch (error) {
    console.error('OpenAI Vision validation error:', error);

    const unavailableReason =
      error instanceof OpenAIConfigurationError ? 'missing_api_key' : 'request_failed';

    const fallback: ValidationResult = {
      primary_gesture: {
        gesture: 'unknown',
        confidence: 0,
        feedback: 'Unable to analyze gesture image',
        quality_score: 0,
        landmarks_detected: false,
        hand_count: 0,
        contextual_meaning: 'Keine zusätzlichen Informationen gefunden. Bitte im DGS-Lexikon oder online nachsehen.',
        reference_sources: [],
      },
      overall_confidence: 0,
      processing_time_ms: Math.max(1, Date.now() - startTime),
      service_status: {
        available: false,
        reason: unavailableReason,
        detail:
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : undefined,
        checked_at: Date.now(),
      },
    };

    return fallback;
  }
}

async function performVisionAnalysis(
  client: OpenAI,
  request: GestureValidationRequest
): Promise<{ validationResult: z.infer<typeof RawValidationResultSchema>; modelUsed: string | null }> {
  const prompt = buildVisionPrompt(request);
  const imgBytes = request.imageBase64?.length || 0;
  const imageDetail = imgBytes > 1_500_000 ? 'low' : 'high';

  let lastError: unknown = null;
  for (const model of VISION_MODELS) {
    try {
      const response = await withTimeoutRetry(
        () =>
          client.responses.create({
            model,
            input: [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: prompt },
                  {
                    type: 'input_image',
                    image_url: `data:image/jpeg;base64,${request.imageBase64}`,
                    detail: imageDetail as 'low' | 'high',
                  },
                ],
              },
            ],
            temperature: OPENAI_TEMPERATURE,
            max_output_tokens: OPENAI_MAX_TOKENS,
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'gesture_validation',
                schema: {
                  type: 'object',
                  properties: {
                    primary_gesture: {
                      type: 'object',
                      properties: {
                        gesture: { type: 'string' },
                        confidence: { type: 'number' },
                        feedback: { type: 'string' },
                        quality_score: { type: 'number' },
                        suggestions: { type: 'array', items: { type: 'string' } },
                        landmarks_detected: { type: 'boolean' },
                        hand_count: { type: 'number' },
                        contextual_meaning: { type: 'string' },
                        reference_sources: { type: 'array', items: { type: 'string' } },
                      },
                      required: ['gesture', 'confidence', 'feedback', 'quality_score', 'landmarks_detected', 'hand_count'],
                    },
                    alternative_gestures: { type: 'array', items: { type: 'object' } },
                    overall_confidence: { type: 'number' },
                  },
                  required: ['primary_gesture', 'overall_confidence'],
                  additionalProperties: true,
                },
                strict: true,
              },
            },
          } as any),
        OPENAI_TIMEOUT_MS,
        0
      );

      const content = (response as any)?.output_text ?? (response as any)?.content ?? '';
      if (!content) {
        throw new Error('No response from OpenAI Vision API');
      }

      const parsedResult = parseVisionResponse(content);
      const validationResult = RawValidationResultSchema.parse(parsedResult);
      return { validationResult, modelUsed: model };
    } catch (attemptError) {
      lastError = attemptError;
      console.warn('OpenAI vision model attempt failed', {
        model,
        error: attemptError instanceof Error ? attemptError.message : String(attemptError),
      });
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('All OpenAI vision models failed');
}

const MeaningRefinementSchema = z.object({
  contextual_meaning: z.string().min(1),
  reference_sources: z.array(z.string()).optional(),
});

async function refineMeaningWithOpenAI(params: {
  client: OpenAI;
  model: string | null;
  gestureName: string | undefined;
  expectedGesture: string | undefined;
  searchSummary: string;
  baseSources: string[];
  existingMeaning: string | undefined;
}): Promise<{ summary: string; sources?: string[] } | null> {
  const { client, model, gestureName, expectedGesture, searchSummary, baseSources, existingMeaning } = params;

  if (!model) {
    return null;
  }

  try {
    const promptSegments: string[] = [];
    promptSegments.push(
      `Du unterstützt Amy's Echo bei der Übersetzung von Handgesten. Amy nutzt Deutsche Gebärdensprache (DGS). Formuliere eine knappe, empathische Erklärung (1-2 Sätze) auf Deutsch, die Pflegepersonen direkt weiterhilft.`
    );
    if (gestureName) {
      promptSegments.push(`Beobachtete Geste (Gloss): ${gestureName}`);
    }
    if (expectedGesture) {
      promptSegments.push(`Erwartete Geste: ${expectedGesture}`);
    }
    if (existingMeaning) {
      promptSegments.push(`Bisherige Modellbeschreibung: ${existingMeaning}`);
    }
    promptSegments.push(`Gefundener Suchhinweis: ${searchSummary}`);
    if (baseSources.length > 0) {
      promptSegments.push(`Verlässliche Quellen-Links: ${baseSources.join(', ')}`);
    }

    const response = await withTimeoutRetry(
      () =>
        client.responses.create({
          model,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text:
                    `${promptSegments.join('\n')}\nAntwortformat: reines JSON {"contextual_meaning": "...", "reference_sources": ["..."]}. Kontext auf DGS konzentrieren, keine unnötigen Floskeln.`,
                },
              ],
            },
          ],
          temperature: Math.min(OPENAI_TEMPERATURE, 0.35),
          max_output_tokens: Math.min(OPENAI_MAX_TOKENS, 400),
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'gesture_meaning_refinement',
              schema: {
                type: 'object',
                properties: {
                  contextual_meaning: { type: 'string' },
                  reference_sources: { type: 'array', items: { type: 'string' } },
                },
                required: ['contextual_meaning'],
                additionalProperties: true,
              },
              strict: true,
            },
          },
        } as any),
      OPENAI_TIMEOUT_MS,
      0
    );

    const content = (response as any)?.output_text ?? (response as any)?.content ?? '';
    if (!content) {
      return null;
    }

    const parsed = MeaningRefinementSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return null;
    }

    const unionSources = new Set<string>([...baseSources]);
    if (Array.isArray(parsed.data.reference_sources)) {
      for (const entry of parsed.data.reference_sources) {
        if (typeof entry === 'string' && entry.trim().length > 0) {
          unionSources.add(entry);
        }
      }
    }

    return {
      summary: parsed.data.contextual_meaning.trim(),
      sources: unionSources.size > 0 ? Array.from(unionSources) : undefined,
    };
  } catch (error) {
    console.warn('Failed to refine gesture meaning with OpenAI', error);
    return null;
  }
}

/**
 * Build detailed prompt for gesture analysis
 */
function buildVisionPrompt(request: GestureValidationRequest): string {
  const basePrompt = `Analyze this gesture image for Amy's Echo communication system.

Amy communicates using Deutsche Gebärdensprache (DGS). Map every observation to the canonical DGS meaning (Kestner Lexikon / gängige DGS-Vokabeln) so caregivers understand the intention, not nur die Handform.

Please identify:
1. The primary gesture being performed (DGS gloss if possible)
2. Your confidence level (0-1)
3. Quality assessment (0-10 scale)
4. Number of hands involved
5. Whether hand landmarks are clearly visible
6. Specific feedback on gesture execution
7. Suggestions for improvement
8. A German contextual_meaning sentence that explains what the DGS sign expresses (e.g. "Zeigefinger zeigt nach unten – bedeutet Urinieren"), referencing everyday communication.
9. reference_sources list with URLs or lexicon hints (Kestner, DGS corpus, trusted dictionary) if available.

${request.expectedGesture ? `Expected gesture: ${request.expectedGesture}` : ''}
${request.context?.environment ? `Environment: ${request.context.environment}` : ''}
${Array.isArray(request.context?.previous_gestures) ? `previous_gestures: ${JSON.stringify(request.context.previous_gestures)}` : ''}

Focus on:
- Hand positioning and orientation
- Finger configurations
- Movement patterns (if visible)
- Clarity of gesture execution
- Potential communication intent in DGS vocabulary

Return your analysis in this exact JSON format only. Do not include prose, code fences, or extra text. If unsure, make your best effort and keep fields consistent.
{
  "primary_gesture": {
    "gesture": "gesture_name",
    "confidence": 0.85,
    "feedback": "Klare Handführung mit deutlicher Orientierung",
    "quality_score": 8.5,
    "suggestions": ["Hand ruhig halten", "Finger vollständig strecken"],
    "landmarks_detected": true,
    "hand_count": 1,
    "contextual_meaning": "Zeigefinger zeigt nach unten – DGS-Bedeutung: Urinieren (Kestner)",
    "reference_sources": ["https://kestner.app/sign/urinieren"]
  },
  "alternative_gestures": [
    {
      "gesture": "alternative_gesture",
      "confidence": 0.3,
      "feedback": "Ähnliche Handform aber andere Bewegung",
      "quality_score": 6.0,
      "landmarks_detected": true,
      "hand_count": 1,
      "contextual_meaning": "Kurze Erklärung der alternativen DGS-Bedeutung",
      "reference_sources": []
    }
  ],
  "overall_confidence": 0.85
}`;

  return basePrompt;
}

/**
 * Parse OpenAI Vision response into structured format
 */
function parseVisionResponse(content: string): any {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const primary = parsed.primary_gesture ?? {};
    const alternatives: any[] = Array.isArray(parsed.alternative_gestures)
      ? parsed.alternative_gestures.map((alt: any) => ({
          gesture: alt?.gesture || 'unknown',
          confidence: Math.max(0, Math.min(1, alt?.confidence || 0)),
          feedback: alt?.feedback || 'Analysis completed',
          quality_score: Math.max(0, Math.min(10, alt?.quality_score || 5)),
          suggestions: Array.isArray(alt?.suggestions) ? alt.suggestions : [],
          landmarks_detected: alt?.landmarks_detected ?? false,
          hand_count: Math.max(0, Math.min(2, alt?.hand_count || 0)),
          contextual_meaning:
            typeof alt?.contextual_meaning === 'string' ? alt.contextual_meaning : undefined,
          reference_sources: Array.isArray(alt?.reference_sources)
            ? alt.reference_sources.filter((entry: any) => typeof entry === 'string')
            : undefined,
        }))
      : [];

    // Ensure required fields exist with defaults
    return {
      primary_gesture: {
        gesture: primary?.gesture || 'unknown',
        confidence: Math.max(0, Math.min(1, primary?.confidence || 0)),
        feedback: primary?.feedback || 'Analysis completed',
        quality_score: Math.max(0, Math.min(10, primary?.quality_score || 5)),
        suggestions: Array.isArray(primary?.suggestions) ? primary.suggestions : [],
        landmarks_detected: primary?.landmarks_detected ?? false,
        hand_count: Math.max(0, Math.min(2, primary?.hand_count || 0)),
        contextual_meaning:
          typeof primary?.contextual_meaning === 'string' ? primary.contextual_meaning : undefined,
        reference_sources: Array.isArray(primary?.reference_sources)
          ? primary.reference_sources.filter((entry: any) => typeof entry === 'string')
          : undefined,
      },
      alternative_gestures: alternatives,
      overall_confidence: Math.max(0, Math.min(1, parsed.overall_confidence || 0)),
    };

  } catch (error) {
    console.error('Failed to parse vision response:', error);
    throw new Error('Invalid response format from OpenAI Vision');
  }
}

/**
 * Check if OpenAI Vision service is available
 */
export async function isVisionServiceAvailable(): Promise<boolean> {
  try {
    // Simple test to check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return false;
    }

    // Could add a lightweight API call here to verify connectivity
    return true;
  } catch {
    return false;
  }
}

/**
 * Get service health status
 */
export async function getVisionServiceHealth(): Promise<{
  available: boolean;
  latency_ms?: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const available = await isVisionServiceAvailable();
    return {
      available,
      latency_ms: Date.now() - startTime,
      error: available ? undefined : 'Missing API key',
    };
  } catch (error) {
    return {
      available: false,
      latency_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Simple timeout + retry helper with exponential backoff
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
      const isRetryable = msg.includes('timed out') || msg.includes('rate') || msg.includes('500') || msg.includes('503');
      if (i >= retries || !isRetryable) throw err;
      const delay = 250 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
      return attempt(i + 1);
    }
  };
  return attempt(0);
}
