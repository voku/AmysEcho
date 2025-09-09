import { useCallback } from 'react';
import { logger } from '../utils/logger';
import { parallelGestureProcessor } from '../services/parallelGestureProcessor';
import { twoHandGestureService } from '../services/twoHandGestureService';
import { isTwoHandGesture } from '../../webview/types/MediaPipeTypes';

export const useParallelProcessing = (onGestureDetected: any, onMergedResult: any, setOpenaiValidationResult: any, setShowOpenaiFeedback: any, handleOpenAIValidation: any) => {
  const handleParallelProcessing = useCallback(async (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handednesses: string[],
    emergency?: boolean,
    capturedFrame?: any
  ) => {
    const frameStartTime = Date.now();

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
        const twoHandResult = await twoHandGestureService.processTwoHandGesture(
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
            emergency
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
        emergency,
        capturedFrame
      );

      if (result.source === 'openai' || result.source === 'combined') {
        setOpenaiValidationResult({
          gesture: result.gesture || '',
          confidence: result.confidence,
          feedback: result.feedback || 'Gesture processed',
          quality_score: result.quality_score || 7.0,
          suggestions: [],
          validation_source: result.source,
        });

        setShowOpenaiFeedback(true);
      }

      if (onMergedResult && result.source === 'combined') {
        onMergedResult(result);
      }

      onGestureDetected(
        result.gesture || '',
        result.confidence,
        result.landmarks || landmarks,
        result.handedness || handednesses,
        result.emergency || emergency
      );

    } catch (error) {
      logger.error('Enhanced gesture detection failed, using MediaPipe result', error, {
        gesture,
        confidence,
        emergency,
      });

      const fallbackGesture = gesture && isTwoHandGesture(gesture)
        ? `${gesture.left}+${gesture.right}`
        : gesture;
      onGestureDetected(fallbackGesture, confidence, landmarks, handednesses, emergency);
    }
  }, [onGestureDetected, onMergedResult, setOpenaiValidationResult, setShowOpenaiFeedback, handleOpenAIValidation]);

  return { handleParallelProcessing };
};