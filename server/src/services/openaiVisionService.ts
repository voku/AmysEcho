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

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configurable model and safety limits
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
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
});

const ValidationResultSchema = z.object({
  primary_gesture: GestureValidationSchema,
  alternative_gestures: z.array(GestureValidationSchema).optional(),
  overall_confidence: z.number().min(0).max(1),
  processing_time_ms: z.number().optional(),
});

export type GestureValidation = z.infer<typeof GestureValidationSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

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

/**
 * Analyze gesture image using OpenAI Vision
 */
export async function validateGestureWithVision(
  request: GestureValidationRequest
): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    // Prepare the vision prompt
    const prompt = buildVisionPrompt(request);

    const imgBytes = request.imageBase64?.length || 0;
    const imageDetail = imgBytes > 1_500_000 ? 'low' : 'high';

    // Responses API with JSON-only schema
    const response = await withTimeoutRetry(
      () => openai.responses.create({
        model: VISION_MODEL,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              // Responses API expects image_url as a string (data URL or remote URL) and detail at top level
              { type: 'input_image', image_url: `data:image/jpeg;base64,${request.imageBase64}`, detail: imageDetail as 'low' | 'high' },
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
                  },
                  required: ['gesture', 'confidence', 'feedback', 'quality_score', 'landmarks_detected', 'hand_count']
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

    // Parse and validate the response
    const parsedResult = parseVisionResponse(content);
    const validationResult = ValidationResultSchema.parse(parsedResult);

    // Add processing time
    validationResult.processing_time_ms = Math.max(1, Date.now() - startTime);

    return validationResult;

  } catch (error) {
    console.error('OpenAI Vision validation error:', error);

    // Return fallback result
    return {
      primary_gesture: {
        gesture: 'unknown',
        confidence: 0,
        feedback: 'Unable to analyze gesture image',
        quality_score: 0,
        landmarks_detected: false,
        hand_count: 0,
      },
      overall_confidence: 0,
      processing_time_ms: Math.max(1, Date.now() - startTime),
    };
  }
}

/**
 * Build detailed prompt for gesture analysis
 */
function buildVisionPrompt(request: GestureValidationRequest): string {
  const basePrompt = `Analyze this gesture image for Amy's Echo communication system.

Please identify:
1. The primary gesture being performed
2. Your confidence level (0-1)
3. Quality assessment (0-10 scale)
4. Number of hands involved
5. Whether hand landmarks are clearly visible
6. Specific feedback on gesture execution
7. Suggestions for improvement

${request.expectedGesture ? `Expected gesture: ${request.expectedGesture}` : ''}
${request.context?.environment ? `Environment: ${request.context.environment}` : ''}
${Array.isArray(request.context?.previous_gestures) ? `previous_gestures: ${JSON.stringify(request.context.previous_gestures)}` : ''}

Focus on:
- Hand positioning and orientation
- Finger configurations
- Movement patterns (if visible)
- Clarity of gesture execution
- Potential communication intent

Return your analysis in this exact JSON format only. Do not include prose, code fences, or extra text. If unsure, make your best effort and keep fields consistent.
{
  "primary_gesture": {
    "gesture": "gesture_name",
    "confidence": 0.85,
    "feedback": "Clear gesture execution with good hand positioning",
    "quality_score": 8.5,
    "suggestions": ["Keep hands steady", "Ensure full finger extension"],
    "landmarks_detected": true,
    "hand_count": 1
  },
  "alternative_gestures": [
    {
      "gesture": "alternative_gesture",
      "confidence": 0.3,
      "feedback": "Similar but different finger positioning",
      "quality_score": 6.0,
      "landmarks_detected": true,
      "hand_count": 1
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

    // Ensure required fields exist with defaults
    return {
      primary_gesture: {
        gesture: parsed.primary_gesture?.gesture || 'unknown',
        confidence: Math.max(0, Math.min(1, parsed.primary_gesture?.confidence || 0)),
        feedback: parsed.primary_gesture?.feedback || 'Analysis completed',
        quality_score: Math.max(0, Math.min(10, parsed.primary_gesture?.quality_score || 5)),
        suggestions: parsed.primary_gesture?.suggestions || [],
        landmarks_detected: parsed.primary_gesture?.landmarks_detected ?? false,
        hand_count: Math.max(0, Math.min(2, parsed.primary_gesture?.hand_count || 0)),
      },
      alternative_gestures: parsed.alternative_gestures || [],
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
