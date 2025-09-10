import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';
import {
  validateGestureWithFallback,
  shouldTriggerOpenAIValidation,
  GestureImageCapture,
} from '../services/openaiGestureValidationService';

const IMAGE_CAPTURE_TIMEOUT_MS = 3000;

const withTimeout = <T>(
  p: Promise<T>,
  ms = IMAGE_CAPTURE_TIMEOUT_MS
) =>
  Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]) as Promise<T | null>;

type Landmarks = number[][][];
type Handednesses = string[];

export type OnGestureDetected = (
  gesture: string | null,
  confidence: number,
  landmarks: Landmarks,
  handednesses: Handednesses,
  emergency?: boolean
) => void;

export interface OpenAIValidationResult {
  gesture: string;
  confidence: number;
  feedback: string;
  quality_score: number;
  suggestions?: string[];
  validation_source: 'mediapipe' | 'openai' | 'combined';
}

export const useOpenAIValidation = (
  onGestureDetected: OnGestureDetected,
  captureImage?: () => Promise<GestureImageCapture | null>
) => {
  const [openaiValidationResult, setOpenaiValidationResult] =
    useState<OpenAIValidationResult | null>(null);
  const [showOpenaiFeedback, setShowOpenaiFeedback] = useState(false);

  const handleOpenAIValidation = useCallback(async (
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

    if (shouldValidate) {
      try {
        const imageCapture = captureImage
          ? await withTimeout(captureImage())
          : null;

        if (imageCapture) {
          const validationResult = await validateGestureWithFallback(
            { gesture, confidence, landmarks },
            imageCapture,
            {
              session_id: 'current-session', // TODO: Get from context
              environment: 'home', // TODO: Get from context
            }
          );

          setOpenaiValidationResult({
            gesture: validationResult.finalGesture,
            confidence: validationResult.finalConfidence,
            feedback: validationResult.feedback || 'Gesture validated',
            quality_score: 7.5, // TODO: Get from OpenAI response
            suggestions: validationResult.suggestions,
            validation_source: validationResult.validationSource,
          });

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
        } else {
          onGestureDetected(gesture, confidence, landmarks, handednesses, emergency);
        }
      } catch (error) {
        logger.warn('OpenAI validation failed, using MediaPipe result', error, {
          gesture,
          confidence,
          emergency
        });
        onGestureDetected(gesture, confidence, landmarks, handednesses, emergency);
      }
    } else {
      onGestureDetected(gesture, confidence, landmarks, handednesses, emergency);
    }
  }, [onGestureDetected, captureImage]);

  return {
    openaiValidationResult,
    setOpenaiValidationResult,
    showOpenaiFeedback,
    setShowOpenaiFeedback,
    handleOpenAIValidation,
  };
};
