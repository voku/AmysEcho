import { Dispatch, SetStateAction, useCallback } from 'react';
import { logger } from '../utils/logger';
import { parallelGestureProcessor } from '../services/parallelGestureProcessor';
import { gestureMeaningService } from '../services/gestureMeaningService';
import { isTwoHandGesture } from '../../webview/types/MediaPipeTypes';
import { DEFAULT_OPENAI_FEEDBACK_MESSAGE, DEFAULT_OPENAI_QUALITY_SCORE } from '../constants';
import type { FrameCapturePayload } from '../types/frames';
import type { GestureResult } from '../services/parallelGestureProcessor';
import type {
  OnGestureDetected,
  OpenAIValidationResult,
} from './useOpenAIValidation';
import type { GestureImageCapture } from '../services/openaiGestureValidationService';

const isGestureImageCapture = (
  frame: FrameCapturePayload | GestureImageCapture | null | undefined,
): frame is GestureImageCapture => {
  if (!frame || typeof frame !== 'object') {
    return false;
  }

  const candidate = frame as Partial<GestureImageCapture>;

  return (
    typeof candidate.base64 === 'string' &&
    candidate.base64.length > 0 &&
    typeof candidate.uri === 'string' &&
    candidate.uri.length > 0 &&
    typeof candidate.width === 'number' &&
    candidate.width > 0 &&
    typeof candidate.height === 'number' &&
    candidate.height > 0 &&
    typeof candidate.timestamp === 'number' &&
    candidate.timestamp > 0
  );
};

export const useParallelProcessing = (
  onGestureDetected: OnGestureDetected,
  onMergedResult: ((result: GestureResult) => void) | undefined,
  setOpenaiValidationResult: Dispatch<SetStateAction<OpenAIValidationResult | null>>,
  setShowOpenaiFeedback: Dispatch<SetStateAction<boolean>>,
  runSequentialValidation?: OnGestureDetected,
) => {
  const handleParallelProcessing = useCallback(async (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handednesses: string[],
    capturedFrame?: FrameCapturePayload | GestureImageCapture | null
  ) => {
    const sequentialFrame = isGestureImageCapture(capturedFrame)
      ? capturedFrame
      : null;

    try {
      if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
        logger.warn('Invalid confidence value, resetting to 0', { confidence, originalConfidence: confidence });
        confidence = 0;
      }

      if (!Array.isArray(landmarks)) {
        logger.warn('Invalid landmarks format, using empty array', { landmarksType: typeof landmarks });
        landmarks = [];
      }

      if (!Array.isArray(handednesses)) {
        logger.warn('Invalid handednesses format, using empty array', { handednessesType: typeof handednesses });
        handednesses = [];
      }

      const hasTwoHands = handednesses.length >= 2 && landmarks.length >= 2;
      const isTwoHandGestureObj = gesture && isTwoHandGesture(gesture);

      const gestureString = isTwoHandGestureObj
        ? `${gesture.left}+${gesture.right}`
        : gesture;

      if (hasTwoHands && isTwoHandGestureObj) {
        const twoHandResult = await gestureMeaningService.processGestureMeaning(
          gesture.left,
          gesture.right,
          confidence,
          confidence,
          handednesses,
          landmarks
        );

        if (twoHandResult) {
          logger.info('Two-hand gesture processed successfully', {
            gestureId: twoHandResult.gesture.id,
            confidence: twoHandResult.confidence,
            processingTime: twoHandResult.processingTime
          });

          onGestureDetected(
            `${twoHandResult.leftHandGesture}+${twoHandResult.rightHandGesture}`,
            twoHandResult.confidence,
            twoHandResult.landmarks,
            twoHandResult.handedness,
            sequentialFrame,
          );

          if (twoHandResult.accessibilityHints.length > 0) {
            logger.debug('Two-hand gesture accessibility hints', {
              hints: twoHandResult.accessibilityHints
            });
          }

          return;
        } else {
          logger.warn('Two-hand gesture processing failed, falling back to parallel processing');
        }
      }

      const result = await parallelGestureProcessor.processMediaPipeResult(
        gestureString,
        confidence,
        landmarks,
        handednesses,
        capturedFrame
      );

      if (result.source === 'openai' || result.source === 'combined') {
        setOpenaiValidationResult({
          gesture: result.gesture || gestureString || '',
          confidence: result.confidence,
          feedback: result.feedback || DEFAULT_OPENAI_FEEDBACK_MESSAGE,
          quality_score: result.quality_score ?? DEFAULT_OPENAI_QUALITY_SCORE,
          suggestions: result.suggestions ?? [],
          validation_source: result.source,
        });

        setShowOpenaiFeedback(true);
        if (onMergedResult && result.source === 'combined') {
          onMergedResult(result);
        }
        onGestureDetected(
          result.gesture || gestureString,
          result.confidence,
          result.landmarks || landmarks,
          result.handedness || handednesses,
          sequentialFrame,
        );
        return;
      }

      const openaiAttemptedAndFailed =
        result.openaiAttempted === true && result.openaiSuccess === false;

      if (runSequentialValidation && !openaiAttemptedAndFailed) {
        await runSequentialValidation(
          result.gesture || gestureString,
          result.confidence,
          result.landmarks || landmarks,
          result.handedness || handednesses,
          sequentialFrame,
        );
        return;
      }

      onGestureDetected(
        result.gesture || gestureString,
        result.confidence,
        result.landmarks || landmarks,
        result.handedness || handednesses,
        sequentialFrame,
      );

    } catch (error) {
      logger.error('Enhanced gesture detection failed, using MediaPipe result', error, {
        gesture,
        confidence,
      });

      const fallbackGesture = gesture && isTwoHandGesture(gesture)
        ? `${gesture.left}+${gesture.right}`
        : gesture;
      if (runSequentialValidation) {
        await runSequentialValidation(
          fallbackGesture,
          confidence,
          landmarks,
          handednesses,
          sequentialFrame,
        );
        return;
      }

      onGestureDetected(
        fallbackGesture,
        confidence,
        landmarks,
        handednesses,
        sequentialFrame,
      );
    }
  }, [
    onGestureDetected,
    onMergedResult,
    runSequentialValidation,
    setOpenaiValidationResult,
    setShowOpenaiFeedback,
  ]);

  return { handleParallelProcessing };
};
