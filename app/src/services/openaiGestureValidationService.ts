/**
 * OpenAI Gesture Validation Service - Client Side
 *
 * Handles image capture and upload to OpenAI Vision API for gesture validation
 * Provides fallback validation when MediaPipe confidence is low
 */

import { Platform } from 'react-native';
import { logger, type LogContext } from '../utils/logger';
import { withErrorHandling } from '../utils/errorUtils';
import { apiPost, buildApiUrl, createAuthHeaders } from '../utils/apiUtils';
import { validateWithRules, commonValidationRules, ValidationRule } from '../utils/validationUtils';

export interface GestureImageCapture {
  uri: string;
  base64: string;
  width: number;
  height: number;
  timestamp: number;
}

export interface ValidationRequest {
  image: GestureImageCapture;
  expectedGesture?: string;
  mediapipeConfidence?: number;
  context?: {
    session_id?: string;
    environment?: 'home' | 'school' | 'therapy';
    previous_gestures?: string[];
  };
}

export interface ValidationResponse {
  success: boolean;
  gesture?: string;
  confidence?: number;
  feedback?: string;
  quality_score?: number;
  suggestions?: string[];
  processing_time_ms?: number;
  error?: string;
}

// Simple in-memory cache to deduplicate rapid identical validations
type CacheEntry = { result: ValidationResponse; ts: number };
const __openaiValidationCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 2000; // 2 seconds

// Lightweight client-side rate limiter (token bucket per process)
let __rateWindowStart = 0;
let __rateCount = 0;
// Defaults: disabled in production, enabled in tests to validate behavior
const DEFAULT_LIMIT = process.env.NODE_ENV === 'test' ? 5 : 0;
const DEFAULT_WINDOW_MS = process.env.NODE_ENV === 'test' ? 10_000 : 0;
const RATE_LIMIT = Number(process.env.EXPO_PUBLIC_OPENAI_RATE_LIMIT ?? DEFAULT_LIMIT);
const RATE_WINDOW_MS = Number(process.env.EXPO_PUBLIC_OPENAI_RATE_WINDOW_MS ?? DEFAULT_WINDOW_MS);

function checkRateLimit(): { allowed: boolean; resetMs: number } {
  if (!RATE_LIMIT || !RATE_WINDOW_MS) {
    return { allowed: true, resetMs: 0 };
  }
  const now = Date.now();
  if (now - __rateWindowStart > RATE_WINDOW_MS) {
    __rateWindowStart = now;
    __rateCount = 0;
  }
  if (__rateCount < RATE_LIMIT) {
    __rateCount++;
    return { allowed: true, resetMs: RATE_WINDOW_MS - (now - __rateWindowStart) };
  }
  return { allowed: false, resetMs: Math.max(0, RATE_WINDOW_MS - (now - __rateWindowStart)) };
}

// Test-only helper to reset limiter state
export function __resetOpenAIRateLimiterForTests() {
  __rateWindowStart = 0;
  __rateCount = 0;
}

function makeCacheKey(req: ValidationRequest): string {
  const b64 = req.image?.base64 || '';
  const head = b64.slice(0, 128);
  const tail = b64.slice(-64);
  const gesture = req.expectedGesture || '';
  return `${gesture}|${head}|${tail}|${req.image?.width}x${req.image?.height}`;
}

/**
 * Capture gesture image from camera stream
 * This would typically be called from the MediaPipeGestureDetector
 */
export async function captureGestureImage(
  videoElement?: any,
  canvasElement?: any
): Promise<GestureImageCapture | null> {
  const result = await withErrorHandling(
    async () => {
      // For web platform, we can capture from canvas/video
      if (Platform.OS === 'web' && canvasElement) {
        const canvas = canvasElement as HTMLCanvasElement;
        const base64 = canvas.toDataURL('image/jpeg', 0.8);

        return {
          uri: base64,
          base64: base64.replace('data:image/jpeg;base64,', ''),
          width: canvas.width,
          height: canvas.height,
          timestamp: Date.now(),
        };
      }

      // For native platforms, we'd need camera permissions and capture
      // This is a placeholder for native image capture implementation
      logger.warn('Native image capture not yet implemented', { platform: Platform.OS });
      return null;
    },
    'captureGestureImage',
    null
  );

  return result.data || null;
}

/**
 * Validate gesture using OpenAI Vision API
 */
export async function validateGestureWithOpenAI(
  request: ValidationRequest
): Promise<ValidationResponse> {
  const startTime = Date.now();

  // Set logging context for this validation operation
  const validationLogContext: Partial<LogContext> = {
    component: 'OpenAIGestureValidation',
  };
  if (request.expectedGesture) {
    validationLogContext.gesture = request.expectedGesture;
  }
  if (request.context?.session_id) {
    validationLogContext.sessionId = request.context.session_id;
  }
  logger.setContext(validationLogContext);

  try {
    // Rate limit to protect UX and budgets
    const rl = checkRateLimit();
    if (!rl.allowed) {
      logger.warn('OpenAI validation rate-limited', { resetMs: rl.resetMs });
      return { success: false, error: 'rate_limited', processing_time_ms: Date.now() - startTime };
    }

    // Cache check: return recent result for identical frame/gesture
    const cacheKey = makeCacheKey(request);
    const cached = __openaiValidationCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      const cachedResult = { ...cached.result, processing_time_ms: Date.now() - startTime };
      logger.info('OpenAI validation cache hit');
      logger.clearContext();
      return cachedResult;
    }
    // Enhanced input validation
    const validationRules: ValidationRule<ValidationRequest>[] = [
      {
        name: 'image_required',
        validate: (req: ValidationRequest) => req.image !== null && req.image !== undefined,
        message: 'Image is required',
        severity: 'error'
      },
      {
        name: 'image_base64_valid',
        validate: (req: ValidationRequest) => req.image?.base64 ? commonValidationRules.base64('base64').validate(req.image.base64) : false,
        message: 'Image base64 data must be valid',
        severity: 'error'
      },
      {
        name: 'image_base64_not_empty',
        validate: (req: ValidationRequest) => Boolean(req.image?.base64 && req.image.base64.length > 0),
        message: 'Image base64 data cannot be empty',
        severity: 'error'
      },
      {
        name: 'gesture_valid',
        validate: (req: ValidationRequest) => !req.expectedGesture || commonValidationRules.gesture('gesture').validate(req.expectedGesture),
        message: 'Expected gesture must be valid if provided',
        severity: 'warning'
      },
      {
        name: 'confidence_valid',
        validate: (req: ValidationRequest) => req.mediapipeConfidence === undefined || commonValidationRules.confidence('confidence').validate(req.mediapipeConfidence),
        message: 'MediaPipe confidence must be between 0 and 1 if provided',
        severity: 'warning'
      }
    ];

    const validationResult = validateWithRules(request, validationRules, 'validateGestureWithOpenAI');

    if (!validationResult.valid) {
      const errorMessage = validationResult.errors.join('; ');
      throw new Error(`Validation failed: ${errorMessage}`);
    }

    if (validationResult.warnings && validationResult.warnings.length > 0) {
      logger.warn('Validation warnings for gesture request', { warnings: validationResult.warnings });
    }

    const apiToken = process.env.EXPO_PUBLIC_API_TOKEN || 'demo-token';

    if (!apiToken) {
      throw new Error('Missing API token configuration');
    }

    const requestBody = {
      imageBase64: request.image.base64,
      expectedGesture: request.expectedGesture,
      mediapipeConfidence: request.mediapipeConfidence,
      context: request.context,
      options: {
        detailed_feedback: true,
        include_alternatives: true,
        confidence_threshold: 0.3,
      },
    };

    const apiResponse = await apiPost(
      buildApiUrl('/api/gesture/validate-vision'),
      requestBody,
      {
        headers: createAuthHeaders(apiToken),
        timeout: 30000, // 30 second timeout for vision processing
        retries: 2
      }
    );

    if (!apiResponse.success) {
      throw new Error(apiResponse.error || 'API request failed');
    }

    const data = apiResponse.data;

    // Validate response structure
    if (!data.primary_gesture) {
      logger.warn('OpenAI response missing primary_gesture', { responseData: data });
      return {
        success: false,
        error: 'Invalid response structure from OpenAI API',
      };
    }

    const result: ValidationResponse = {
      success: true,
      processing_time_ms: Date.now() - startTime,
    };

    if (data.primary_gesture?.gesture) {
      result.gesture = data.primary_gesture.gesture;
    }

    if (typeof data.primary_gesture?.confidence === 'number') {
      result.confidence = Math.max(0, Math.min(1, data.primary_gesture.confidence));
    }

    if (data.primary_gesture?.feedback) {
      result.feedback = data.primary_gesture.feedback;
    }

    if (typeof data.primary_gesture?.quality_score === 'number') {
      result.quality_score = Math.max(0, Math.min(10, data.primary_gesture.quality_score));
    }

    if (Array.isArray(data.primary_gesture?.suggestions)) {
      result.suggestions = data.primary_gesture.suggestions;
    }

    // Cache the successful result
    __openaiValidationCache.set(cacheKey, { result, ts: Date.now() });

    // Log successful validation
    if (result.processing_time_ms !== undefined) {
      logger.performanceMetric('openai_validation', result.processing_time_ms);
      logger.info('OpenAI validation completed', { duration: result.processing_time_ms });
    } else {
      logger.info('OpenAI validation completed');
    }

    logger.clearContext();
    return result;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('OpenAI validation failed', error, { duration: processingTime });

    logger.clearContext();
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
      processing_time_ms: processingTime,
    };
  }
}

/**
 * Determine if OpenAI validation should be triggered
 */
export function shouldTriggerOpenAIValidation(
  mediapipeConfidence: number,
  gesture: string,
  options?: {
    lowConfidenceThreshold?: number;
    alwaysValidateGestures?: string[];
    emergencyGestures?: string[];
    enableSmartValidation?: boolean;
    validationHistory?: Array<{
      gesture: string;
      originalConfidence: number;
      validatedConfidence: number;
      wasImproved: boolean;
    }>;
  }
): boolean {
  const {
    lowConfidenceThreshold = 0.6,
    alwaysValidateGestures = ['emergency', 'help', 'stop'],
    emergencyGestures = ['emergency', 'help', 'stop'],
    enableSmartValidation = true,
    validationHistory = [],
  } = options || {};

  // Always validate emergency gestures for safety
  if (emergencyGestures.some(emergency => gesture.toLowerCase().includes(emergency))) {
    return true;
  }

  // Always validate specific gestures that benefit from AI analysis
  if (alwaysValidateGestures.some(validateGesture => gesture.toLowerCase().includes(validateGesture))) {
    return true;
  }

  // Basic confidence threshold check
  if (mediapipeConfidence < lowConfidenceThreshold) {
    return true;
  }

  // Smart validation based on historical performance
  if (enableSmartValidation && validationHistory.length > 0) {
    const recentValidations = validationHistory.slice(-10); // Last 10 validations
    const gestureValidations = recentValidations.filter(v => v.gesture === gesture);

    if (gestureValidations.length >= 3) {
      const improvementRate = gestureValidations.filter(v => v.wasImproved).length / gestureValidations.length;

      // If this gesture has been improved by AI validation > 50% of the time, validate it
      if (improvementRate > 0.5) {
        return true;
      }

      // If confidence is borderline and we've seen improvements, validate
      if (mediapipeConfidence < 0.75 && improvementRate > 0.3) {
        return true;
      }
    }

    // Validate unknown or rarely seen gestures
    const uniqueGestures = new Set(validationHistory.map(v => v.gesture));
    if (!uniqueGestures.has(gesture)) {
      return true; // New gesture, validate to establish baseline
    }
  }

  // Adaptive threshold based on gesture complexity
  const complexGestures = ['please', 'thank_you', 'sorry', 'more'];
  if (complexGestures.some(complex => gesture.toLowerCase().includes(complex))) {
    return mediapipeConfidence < 0.7; // Lower threshold for complex gestures
  }

  return false;
}

/**
 * Calculate adaptive confidence threshold based on context
 */
export function calculateAdaptiveThreshold(
  baseThreshold: number = 0.6,
  context?: {
    gesture: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    environment?: 'home' | 'school' | 'therapy';
    userExperience?: 'beginner' | 'intermediate' | 'advanced';
    recentAccuracy?: number;
  }
): number {
  let threshold = baseThreshold;

  if (!context) return threshold;

  // Adjust for time of day (users may be more tired in the evening)
  if (context.timeOfDay === 'evening') {
    threshold = Math.round((threshold - 0.05) * 100) / 100;
  }

  // Adjust for environment (school may have more distractions)
  if (context.environment === 'school') {
    threshold = Math.round((threshold - 0.03) * 100) / 100;
  }

  // Adjust for user experience
  switch (context.userExperience) {
    case 'beginner':
      threshold = Math.round((threshold - 0.1) * 100) / 100; // More validation for beginners
      break;
    case 'advanced':
      threshold = Math.round((threshold + 0.05) * 100) / 100; // Less validation for advanced users
      break;
  }

  // Adjust based on recent accuracy
  if (context.recentAccuracy !== undefined) {
    if (context.recentAccuracy < 0.7) {
      threshold = Math.round((threshold - 0.05) * 100) / 100; // More validation when accuracy is low
    } else if (context.recentAccuracy > 0.9) {
      threshold = Math.round((threshold + 0.03) * 100) / 100; // Less validation when accuracy is high
    }
  }

  // Ensure threshold stays within reasonable bounds
  return Math.max(0.3, Math.min(0.8, threshold));
}

/**
 * Combined validation: MediaPipe + OpenAI fallback
 */
export async function validateGestureWithFallback(
  mediapipeResult: {
    gesture: string;
    confidence: number;
    landmarks?: number[][][];
  },
  imageCapture?: GestureImageCapture,
  context?: ValidationRequest['context']
): Promise<{
  finalGesture: string;
  finalConfidence: number;
  validationSource: 'mediapipe' | 'openai' | 'combined';
  feedback?: string;
  suggestions?: string[];
  quality_score?: number;
}> {
  // Set logging context for this validation operation
  const fallbackLogContext: Partial<LogContext> = {
    component: 'GestureValidationFallback',
    gesture: mediapipeResult.gesture,
  };
  if (context?.session_id) {
    fallbackLogContext.sessionId = context.session_id;
  }
  logger.setContext(fallbackLogContext);

  // Start with MediaPipe result
  let finalGesture = mediapipeResult.gesture;
  let finalConfidence = mediapipeResult.confidence;
  let validationSource: 'mediapipe' | 'openai' | 'combined' = 'mediapipe';
  let feedback: string | undefined;
  let suggestions: string[] | undefined;
  let quality_score: number | undefined;

  // Check if we should trigger OpenAI validation
  if (imageCapture && shouldTriggerOpenAIValidation(mediapipeResult.confidence, mediapipeResult.gesture)) {
    logger.info('Triggering OpenAI validation for low confidence gesture', {
      gesture: mediapipeResult.gesture,
      confidence: mediapipeResult.confidence
    });

    try {
      const validationRequest: ValidationRequest = {
        image: imageCapture,
        mediapipeConfidence: mediapipeResult.confidence,
      };
      if (mediapipeResult.gesture) {
        validationRequest.expectedGesture = mediapipeResult.gesture;
      }
      if (context) {
        validationRequest.context = context;
      }

      const openaiResult = await validateGestureWithOpenAI(validationRequest);

      if (openaiResult.success && openaiResult.confidence !== undefined) {
        // Use OpenAI result if it's more confident or if MediaPipe was very uncertain
        if (openaiResult.confidence > mediapipeResult.confidence + 0.2 ||
            mediapipeResult.confidence < 0.4) {
          finalGesture = openaiResult.gesture || finalGesture;
          finalConfidence = Math.max(openaiResult.confidence, mediapipeResult.confidence);

          // Determine validation source based on confidence difference
          if (mediapipeResult.confidence < 0.4) {
            // MediaPipe was very uncertain, use OpenAI result
            validationSource = 'openai';
          } else if (openaiResult.confidence > mediapipeResult.confidence + 0.2) {
            // OpenAI significantly more confident
            validationSource = 'openai';
          } else {
            // Close confidence levels, combine results
            validationSource = 'combined';
          }

          feedback = openaiResult.feedback;
          suggestions = openaiResult.suggestions;
          quality_score = openaiResult.quality_score;
        }
      }
    } catch (error) {
      logger.warn('OpenAI validation failed, using MediaPipe result', error);
    }
  }

  logger.clearContext();
  const outcome: {
    finalGesture: string;
    finalConfidence: number;
    validationSource: 'mediapipe' | 'openai' | 'combined';
    feedback?: string;
    suggestions?: string[];
    quality_score?: number;
  } = {
    finalGesture,
    finalConfidence,
    validationSource,
  };

  if (feedback) {
    outcome.feedback = feedback;
  }
  if (suggestions) {
    outcome.suggestions = suggestions;
  }
  if (quality_score !== undefined) {
    outcome.quality_score = quality_score;
  }

  return outcome;
}

/**
 * Save validation result for analytics and learning
 */
export async function saveValidationResult(
  result: {
    originalGesture: string;
    originalConfidence: number;
    finalGesture: string;
    finalConfidence: number;
    validationSource: string;
    feedback?: string;
    suggestions?: string[];
    imageUri?: string;
  }
): Promise<void> {
  const saveResult = await withErrorHandling(
    async () => {
      // This would typically save to a local database or send to analytics
      logger.info('Saving validation result', result);

      // Placeholder for analytics integration
      // await analyticsService.trackEvent('gesture_validation', result);
    },
    'saveValidationResult'
  );

  if (!saveResult.success) {
    logger.warn('Failed to save validation result, continuing...', saveResult.error);
  }
}
