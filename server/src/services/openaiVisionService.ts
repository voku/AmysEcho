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
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  processing_time_ms: z.number(),
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

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${request.imageBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.1, // Low temperature for consistent analysis
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI Vision API');
    }

    // Parse and validate the response
    const parsedResult = parseVisionResponse(content);
    const validationResult = ValidationResultSchema.parse(parsedResult);

    // Add processing time
    validationResult.processing_time_ms = Date.now() - startTime;

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
      processing_time_ms: Date.now() - startTime,
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

Focus on:
- Hand positioning and orientation
- Finger configurations
- Movement patterns (if visible)
- Clarity of gesture execution
- Potential communication intent

Return your analysis in this exact JSON format:
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
    };
  } catch (error) {
    return {
      available: false,
      latency_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}