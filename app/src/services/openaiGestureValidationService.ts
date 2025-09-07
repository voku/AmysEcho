/**
 * OpenAI Gesture Validation Service - Client Side
 *
 * Handles image capture and upload to OpenAI Vision API for gesture validation
 * Provides fallback validation when MediaPipe confidence is low
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

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

/**
 * Capture gesture image from camera stream
 * This would typically be called from the MediaPipeGestureDetector
 */
export async function captureGestureImage(
  videoElement?: any,
  canvasElement?: any
): Promise<GestureImageCapture | null> {
  try {
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
    console.warn('Native image capture not yet implemented');
    return null;

  } catch (error) {
    console.error('Failed to capture gesture image:', error);
    return null;
  }
}

/**
 * Validate gesture using OpenAI Vision API
 */
export async function validateGestureWithOpenAI(
  request: ValidationRequest
): Promise<ValidationResponse> {
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
    const apiToken = process.env.EXPO_PUBLIC_API_TOKEN || 'demo-token';

    const response = await fetch(`${apiUrl}/api/gesture/validate-vision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        imageBase64: request.image.base64,
        expectedGesture: request.expectedGesture,
        mediapipeConfidence: request.mediapipeConfidence,
        context: request.context,
        options: {
          detailed_feedback: true,
          include_alternatives: true,
          confidence_threshold: 0.3,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      success: true,
      gesture: data.primary_gesture?.gesture,
      confidence: data.primary_gesture?.confidence,
      feedback: data.primary_gesture?.feedback,
      quality_score: data.primary_gesture?.quality_score,
      suggestions: data.primary_gesture?.suggestions,
      processing_time_ms: data.processing_time_ms,
    };

  } catch (error) {
    console.error('OpenAI validation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
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
  }
): boolean {
  const {
    lowConfidenceThreshold = 0.6,
    alwaysValidateGestures = ['emergency', 'help', 'stop'],
    emergencyGestures = ['emergency', 'help', 'stop'],
  } = options || {};

  // Always validate emergency gestures
  if (emergencyGestures.some(emergency => gesture.toLowerCase().includes(emergency))) {
    return true;
  }

  // Validate if confidence is below threshold
  if (mediapipeConfidence < lowConfidenceThreshold) {
    return true;
  }

  // Validate specific gestures that benefit from AI analysis
  if (alwaysValidateGestures.some(validateGesture => gesture.toLowerCase().includes(validateGesture))) {
    return true;
  }

  return false;
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
}> {
  // Start with MediaPipe result
  let finalGesture = mediapipeResult.gesture;
  let finalConfidence = mediapipeResult.confidence;
  let validationSource: 'mediapipe' | 'openai' | 'combined' = 'mediapipe';
  let feedback: string | undefined;
  let suggestions: string[] | undefined;

  // Check if we should trigger OpenAI validation
  if (imageCapture && shouldTriggerOpenAIValidation(mediapipeResult.confidence, mediapipeResult.gesture)) {
    console.log('Triggering OpenAI validation for low confidence gesture');

    try {
      const openaiResult = await validateGestureWithOpenAI({
        image: imageCapture,
        expectedGesture: mediapipeResult.gesture,
        mediapipeConfidence: mediapipeResult.confidence,
        context,
      });

      if (openaiResult.success && openaiResult.confidence !== undefined) {
        // Use OpenAI result if it's more confident or if MediaPipe was very uncertain
        if (openaiResult.confidence > mediapipeResult.confidence + 0.2 ||
            mediapipeResult.confidence < 0.4) {
          finalGesture = openaiResult.gesture || finalGesture;
          finalConfidence = Math.max(openaiResult.confidence, mediapipeResult.confidence);
          validationSource = openaiResult.confidence > mediapipeResult.confidence ? 'openai' : 'combined';
          feedback = openaiResult.feedback;
          suggestions = openaiResult.suggestions;
        }
      }
    } catch (error) {
      console.warn('OpenAI validation failed, using MediaPipe result:', error);
    }
  }

  return {
    finalGesture,
    finalConfidence,
    validationSource,
    feedback,
    suggestions,
  };
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
  try {
    // This would typically save to a local database or send to analytics
    console.log('Saving validation result:', result);

    // Placeholder for analytics integration
    // await analyticsService.trackEvent('gesture_validation', result);

  } catch (error) {
    console.error('Failed to save validation result:', error);
  }
}