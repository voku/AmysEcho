import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';
import { validateGestureWithFallback, shouldTriggerOpenAIValidation } from '../services/openaiGestureValidationService';

export const useOpenAIValidation = (onGestureDetected: any) => {
  const [openaiValidationResult, setOpenaiValidationResult] = useState<{
    gesture: string;
    confidence: number;
    feedback: string;
    quality_score: number;
    suggestions?: string[];
    validation_source: 'mediapipe' | 'openai' | 'combined';
  } | null>(null);
  const [showOpenaiFeedback, setShowOpenaiFeedback] = useState(false);

  const handleOpenAIValidation = useCallback(async (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handednesses: string[],
    emergency?: boolean
  ) => {
    if (!gesture) {
      onGestureDetected(null, confidence, landmarks, handednesses, emergency);
      return;
    }

    const shouldValidate = shouldTriggerOpenAIValidation(confidence, gesture);

    if (shouldValidate) {
      try {
        const imageCapture = null; // TODO: Implement actual image capture

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
  }, [onGestureDetected]);

  return {
    openaiValidationResult,
    setOpenaiValidationResult,
    showOpenaiFeedback,
    setShowOpenaiFeedback,
    handleOpenAIValidation,
  };
};