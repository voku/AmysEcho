import { useState, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';
import {
  validateGestureWithFallback,
  shouldTriggerOpenAIValidation,
  GestureImageCapture,
} from '../services/openaiGestureValidationService';

export type OpenAIValidationResult = {
  gesture: string;
  confidence: number;
  feedback: string;
  quality_score: number;
  suggestions?: string[];
  validation_source: 'mediapipe' | 'openai' | 'combined';
};

export type Landmarks = number[][][];
export type Handednesses = string[];
export type OnGestureDetected = (
  gesture: string | null,
  confidence: number,
  landmarks: Landmarks,
  handednesses: Handednesses,
  emergency?: boolean
) => void;

const IMAGE_CAPTURE_TIMEOUT_MS = 3000;

export const withTimeout = <T>(
  p: Promise<T>,
  ms = IMAGE_CAPTURE_TIMEOUT_MS
): Promise<T | null> =>
  Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]) as Promise<T | null>;

export const useOpenAIValidation = (
  onGestureDetected: OnGestureDetected,
  captureImage?: () => Promise<GestureImageCapture | null>
) => {
  const [openaiValidationResult, setOpenaiValidationResult] =
    useState<OpenAIValidationResult | null>(null);
  const [showOpenaiFeedback, setShowOpenaiFeedback] = useState(false);
  const sessionIdRef = useRef(`session_${Date.now()}`);
  const environment = ((): 'home' | 'school' | 'therapy' => {
    const env = process.env['EXPO_PUBLIC_DEFAULT_ENVIRONMENT'];
    if (env === 'home' || env === 'school' || env === 'therapy') {
      return env;
    }
    return 'home';
  })();

  const handleOpenAIValidation = useCallback(
    async (
      gesture: string | null,
      confidence: number,
      landmarks: Landmarks,
      handednesses: Handednesses,
      emergency?: boolean
    ) => {
      if (!gesture) {
        onGestureDetected(null, confidence, landmarks, handednesses, emergency);
        return;
      }

      const shouldValidate = shouldTriggerOpenAIValidation(confidence, gesture);

      if (!shouldValidate) {
        onGestureDetected(gesture, confidence, landmarks, handednesses, emergency);
        return;
      }

      try {
        const imageCapture = captureImage
          ? await withTimeout(captureImage())
          : null;

        if (!imageCapture) {
          onGestureDetected(gesture, confidence, landmarks, handednesses, emergency);
          return;
        }

        const validationResult = await validateGestureWithFallback(
          { gesture, confidence, landmarks },
          imageCapture,
          {
            session_id: sessionIdRef.current,
            environment,
          }
        );

        const result: OpenAIValidationResult = {
          gesture: validationResult.finalGesture,
          confidence: validationResult.finalConfidence,
          feedback: validationResult.feedback || 'Geste validiert',
          quality_score: validationResult.quality_score ?? 0,
          validation_source: validationResult.validationSource,
        };

        if (validationResult.suggestions) {
          result.suggestions = validationResult.suggestions;
        }

        setOpenaiValidationResult(result);

        if (validationResult.validationSource !== 'mediapipe') {
          setShowOpenaiFeedback(true);
        }

        onGestureDetected(
          validationResult.finalGesture,
          validationResult.finalConfidence,
          landmarks,
          handednesses,
          emergency
        );
      } catch (error) {
        logger.warn('OpenAI validation failed, using MediaPipe result', error, {
          gesture,
          confidence,
          emergency,
        });
        onGestureDetected(gesture, confidence, landmarks, handednesses, emergency);
      }
    },
    [onGestureDetected, captureImage]
  );

  return {
    openaiValidationResult,
    setOpenaiValidationResult,
    showOpenaiFeedback,
    setShowOpenaiFeedback,
    handleOpenAIValidation,
  };
};
