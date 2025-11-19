import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  audioService,
  triggerSpeakAndShow,
  announceGestureRecognition,
  detectionHapticFeedback,
  partialGestureHapticFeedback,
  multiSensoryFeedback,
  personalizedConfidenceService,
  gestureCombinationService,
  correctionService,
  gestureMeaningService,
} from '../services';
import { gestureHistoryService } from '../services/gestureHistoryService';
import { automaticRecoveryService } from '../services/automaticRecoveryService';
import { zeroDowntimeModelService } from '../services/zeroDowntimeModelService';
import { optimizedGestureService } from '../services/optimizedGestureService';
import { logHIPEvent } from '../services/hipEvents';
import { emergencyRollback } from '../services/modelUpdate';
import { contextAwareRecognitionService } from '../services/contextAwareRecognitionService';
import { activeLearningService } from '../services/activeLearningService';
import { adaptiveLearningService } from '../services/adaptiveLearningService';
import gestureSuggester from '../services/gestureSuggester';
import * as Haptics from 'expo-haptics';
import { logger } from '../utils/logger';
import type { OneEuroFilter } from '../services/OneEuroFilter';
import { ScreenFlashPattern, type RecognitionState } from './useRecognitionState';
import type { MediaPipeErrorDetails } from '../components/MediaPipeGestureDetector';
import type { RecognitionPath } from '../utils/recognitionState';
import type { TabNavigationProp } from '../navigation/types';
import { APP_TAB_ROUTES, ROOT_STACK_ROUTES } from '../navigation/types';
import {
  isCoordinatedGestureString,
  parseCoordinatedGestureString,
  getGestureMeaningBySequenceId,
  findSequenceGestureMeaningByGestures,
} from '../constants/gestureMeanings';
import { shouldPromptPractice } from '../services/healthScore';
import { logInteractionEvent } from '../services/analytics';

const PREDICTION_ERROR_TEXT = 'Das hat nicht geklappt. Lass es uns nochmal versuchen!';
const RECOVERING_CAMERA_TEXT = 'Ups! Ich starte die Kamera neu…';

type Navigation = TabNavigationProp<typeof APP_TAB_ROUTES.Recognition>;

interface RecognitionRefs {
  confidenceFilterRef: MutableRefObject<OneEuroFilter>;
  labelHistoryRef: MutableRefObject<string[]>;
  lastGestureIdRef: MutableRefObject<string | null>;
  lastSuccessAtRef: MutableRefObject<number>;
  lastFrameTimeRef: MutableRefObject<number>;
  lastModelUpdateTimeRef: MutableRefObject<number>;
  activeGestureRef: MutableRefObject<string | null>;
}

interface RecognitionHelpers {
  startFeedbackAnimation: () => void;
  getSuccessMessage: (gestureId: string) => string;
}

export interface UseRecognitionCallbacksArgs {
  navigation: Navigation;
  state: RecognitionState;
  refs: RecognitionRefs;
  helpers: RecognitionHelpers;
}

const SUCCESS_FLASH: ScreenFlashPattern = ScreenFlashPattern.Success;
const ENCOURAGEMENT_STATUS = 'Fast! Mach weiter so – ich sehe deine Hände!';
const WAITING_STATUS = 'Ich suche deine Hände…';
const WAITING_CONFIDENCE_THRESHOLD = 0.15;
const LOW_CONFIDENCE_MARGIN = 0.05;
const VISUAL_RIPPLE_RESET_DELAY_MS = 280;
const PRACTICE_SUGGESTION_DELAY_MS = 2000;
const RECENT_GESTURE_SUPPRESS_MS = 1000;
const SCREEN_FLASH_RESET_DELAY_MS = 600;
const PRACTICE_PROMPT_OPTIONS = {
  minSamples: 5,
  lastN: 10,
  threshold: 0.6,
};
const ACTIVE_GESTURE_HOLD_MS = 600;

const normalizeGestureId = (gesture: string | null): string | null => {
  if (!gesture) return null;
  return gesture.trim().toLowerCase();
};

const sanitizeConfidence = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return null;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
};

export const useRecognitionCallbacks = ({
  navigation,
  state,
  refs,
  helpers,
}: UseRecognitionCallbacksArgs) => {
  const {
    setStatus,
    setPendingGesture,
    setGestureSuggestions,
    setShowCorrection,
    setShowPracticeSuggestion,
    setShowAdaptiveLearning,
    setWebviewRetries,
    setWebviewKey,
    setError,
    setGestureConfidence,
    setLastRecognizedGesture,
    setRecognitionPath,
    setShowVisualRipple,
    setShowScreenFlash,
    setScreenFlashPattern,
    setShortcutActivated,
    setCurrentLandmarks,
    setCurrentHandedness,
    setModelUpdateStatus,
    setContextInsights,
    setDetectedGestureMeaning,
    setSequenceMeaning,
    setSequenceMatch,
  } = state;

  const {
    successSound,
    contextInsights,
    gestureConfidence,
    lastRecognizedGesture,
    setLastSuccessfulConfidence,
  } = state;

  const encouragementTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualRippleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGestureClearTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutRef = useCallback((ref: MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const clearEncouragementTimeout = useCallback(() => {
    clearTimeoutRef(encouragementTimeout);
  }, [clearTimeoutRef]);

  const clearScreenFlashTimeout = useCallback(() => {
    clearTimeoutRef(screenFlashTimeout);
  }, [clearTimeoutRef]);

  const clearVisualRippleTimeout = useCallback(() => {
    clearTimeoutRef(visualRippleTimeout);
  }, [clearTimeoutRef]);

  const cancelActiveGestureClear = useCallback(() => {
    clearTimeoutRef(activeGestureClearTimeout);
  }, [clearTimeoutRef]);

  const finalizeActiveGestureClear = useCallback(() => {
    refs.activeGestureRef.current = null;
    setPendingGesture(null);
    setDetectedGestureMeaning(null);
    setStatus(WAITING_STATUS);
  }, [refs, setDetectedGestureMeaning, setPendingGesture, setStatus]);

  const scheduleActiveGestureClear = useCallback(() => {
    if (activeGestureClearTimeout.current) {
      return;
    }

    activeGestureClearTimeout.current = setTimeout(() => {
      activeGestureClearTimeout.current = null;
      finalizeActiveGestureClear();
    }, ACTIVE_GESTURE_HOLD_MS);
  }, [finalizeActiveGestureClear]);

  const schedulePracticeSuggestion = useCallback(() => {
    if (!encouragementTimeout.current) {
      encouragementTimeout.current = setTimeout(() => {
        encouragementTimeout.current = null;
        setShowPracticeSuggestion(true);
      }, PRACTICE_SUGGESTION_DELAY_MS);
    }
  }, [setShowPracticeSuggestion]);

  useEffect(
    () => () => {
      clearEncouragementTimeout();
      clearScreenFlashTimeout();
      clearVisualRippleTimeout();
      cancelActiveGestureClear();
    },
    [
      cancelActiveGestureClear,
      clearEncouragementTimeout,
      clearScreenFlashTimeout,
      clearVisualRippleTimeout,
    ],
  );

  const handleLowConfidenceGesture = useCallback(
    (
      gesture: string,
      smoothedConfidence: number,
      threshold: number,
      landmarks: number[][][],
    ) => {
      setError(null);
      activeLearningService.recordUncertainSample(gesture, smoothedConfidence, landmarks, {
        timeOfDay: new Date().getHours(),
        activityLevel: 'normal',
        consecutiveFailures: 1,
      });
      setStatus(ENCOURAGEMENT_STATUS);
      setShowScreenFlash(false);
      setScreenFlashPattern(ScreenFlashPattern.Pulse);
      void detectionHapticFeedback().catch((error) =>
        logger.debug('Detection haptic feedback failed', error),
      );
      if (smoothedConfidence > threshold - LOW_CONFIDENCE_MARGIN) {
      void partialGestureHapticFeedback(smoothedConfidence).catch((error) =>
        logger.debug('Partial haptic feedback failed', error),
      );
    }

      schedulePracticeSuggestion();

      const gestureMeta = optimizedGestureService.getGestureById(gesture);
      void logInteractionEvent({
        gestureDefinitionId: gestureMeta?.id ?? gesture,
        gestureName: gestureMeta?.label ?? gesture,
        wasSuccessful: false,
        confidenceScore: smoothedConfidence,
        timestamp: Date.now(),
        processedBy: 'local',
      }).catch((error) => logger.debug('Failed to log uncertain gesture event', error));

      if (lastRecognizedGesture) {
        void shouldPromptPractice(lastRecognizedGesture.id, PRACTICE_PROMPT_OPTIONS)
          .then((shouldShow) => {
            if (shouldShow) {
              setShowPracticeSuggestion(true);
            }
          })
          .catch((error) => logger.debug('Practice suggestion check failed', error));
      }
    },
    [
      schedulePracticeSuggestion,
      setShowScreenFlash,
      setScreenFlashPattern,
      setStatus,
      lastRecognizedGesture,
      setShowPracticeSuggestion,
      setError,
    ],
  );

  const showSuccessfulGestureUi = useCallback(
    (
      gesture: string,
      gestureMeta: ReturnType<typeof optimizedGestureService.getGestureById> | null,
      label: string,
      emoji: string,
      smoothedConfidence: number,
      landmarks: number[][][],
      recognitionSource: RecognitionPath,
    ) => {
      setRecognitionPath(recognitionSource);
      setLastRecognizedGesture(gestureMeta);
      setStatus(helpers.getSuccessMessage(gesture));
      helpers.startFeedbackAnimation();
      setScreenFlashPattern(SUCCESS_FLASH);
      setShowScreenFlash(true);
      clearScreenFlashTimeout();
      screenFlashTimeout.current = setTimeout(() => {
        setShowScreenFlash(false);
        screenFlashTimeout.current = null;
      }, SCREEN_FLASH_RESET_DELAY_MS);

      gestureHistoryService.addGesture({
        id: gesture,
        label,
        emoji,
        confidence: smoothedConfidence,
        landmarks,
        audioResponse: successSound,
      });

      announceGestureRecognition(label, smoothedConfidence);
    },
    [
      clearScreenFlashTimeout,
      helpers,
      setLastRecognizedGesture,
      setRecognitionPath,
      setScreenFlashPattern,
      setShowScreenFlash,
      setStatus,
      successSound,
    ],
  );

  const runRecognitionFeedback = useCallback(
    async (
      gesture: string,
      label: string,
      smoothedConfidence: number,
    ) => {
      await Promise.all([
        multiSensoryFeedback(gesture, smoothedConfidence, {
          ...contextInsights,
          isEmergency: false,
        }),
        triggerSpeakAndShow(label, smoothedConfidence, helpers.startFeedbackAnimation),
        (async () => {
          if (successSound) {
            try {
              await audioService.playSound(successSound);
            } catch (error) {
              logger.debug('Failed to play success sound', error);
            }
          }
        })(),
      ]);
    },
    [contextInsights, helpers, successSound],
  );

  const handlePostRecognitionFollowups = useCallback(
    (
      gesture: string,
      smoothedConfidence: number,
      landmarks: number[][][],
      handedness: string[],
    ) => {
      void logHIPEvent('HIP_1', 'gesture_recognized', {
        gesture,
        confidence: smoothedConfidence,
        emergency: false,
      }).catch((error) => logger.warn('Failed to log HIP event', error));

      activeLearningService.recordPracticeResults(gesture, smoothedConfidence);

      const sequence = gestureCombinationService.processGesture(gesture, smoothedConfidence);
      if (sequence?.sequence) {
        setSequenceMatch(sequence);
        setStatus(`✨ ${sequence.sequence.combinedMeaning}`);

        if (sequence.remainingGestures.length === 0) {
          const resolvedSequence =
            getGestureMeaningBySequenceId(sequence.sequenceId) ??
            findSequenceGestureMeaningByGestures(sequence.sequence.gestures);

          if (resolvedSequence) {
            setSequenceMeaning(resolvedSequence);
          } else {
            setSequenceMeaning(null);
          }
        } else {
          setSequenceMeaning(null);
        }
      } else {
        setSequenceMatch(null);
        setSequenceMeaning(null);
      }

      const adaptiveRecommendations = adaptiveLearningService.getAdaptiveRecommendations(
        refs.labelHistoryRef.current,
        5,
      );
      if (adaptiveRecommendations.some((rec) => rec.type === 'practice')) {
        setShowAdaptiveLearning(true);
      }

      const suggestions = gestureSuggester.getSuggestions(gesture, {
        recentGestures: refs.labelHistoryRef.current,
        timeOfDay: new Date().getHours(),
        confidence: smoothedConfidence,
        landmarks,
        handedness,
      });
      if (suggestions.length) {
        setGestureSuggestions(
          suggestions.map(({ id, label: suggestionLabel }) => ({
            id,
            label: suggestionLabel,
          })),
        );
        setShowCorrection(true);
      }

      setShortcutActivated(null);

      void shouldPromptPractice(gesture, PRACTICE_PROMPT_OPTIONS)
        .then((shouldShow) => setShowPracticeSuggestion(shouldShow))
        .catch((error) => logger.debug('Failed to evaluate practice suggestion', error));
    },
    [
      refs.labelHistoryRef,
      setGestureSuggestions,
      setSequenceMatch,
      setSequenceMeaning,
      setShortcutActivated,
      setShowAdaptiveLearning,
      setShowCorrection,
      setShowPracticeSuggestion,
      setStatus,
    ],
  );

  const handleSuccessfulGesture = useCallback(
    async (
      gesture: string,
      smoothedConfidence: number,
      landmarks: number[][][],
      handedness: string[],
      recognitionSource: RecognitionPath,
    ) => {
      setPendingGesture(null);
      setShowVisualRipple(false);
      setError(null);

      const gestureMeta = optimizedGestureService.getGestureById(gesture);
      const label = gestureMeta?.label || gesture;
      const emoji = gestureMeta?.emoji || '🤟';

      if (isCoordinatedGestureString(gesture)) {
        const parsed = parseCoordinatedGestureString(gesture);
        if (parsed) {
          const twoHandResult = await gestureMeaningService.processGestureMeaning(
            parsed.left,
            parsed.right,
            smoothedConfidence,
            smoothedConfidence,
            handedness,
            landmarks,
          );

          setDetectedGestureMeaning(twoHandResult);
        } else {
          setDetectedGestureMeaning(null);
        }
      } else {
        setDetectedGestureMeaning(null);
      }

      showSuccessfulGestureUi(
        gesture,
        gestureMeta ?? null,
        label,
        emoji,
        smoothedConfidence,
        landmarks,
        recognitionSource,
      );

      void logInteractionEvent({
        gestureDefinitionId: gestureMeta?.id ?? gesture,
        gestureName: label,
        wasSuccessful: true,
        confidenceScore: smoothedConfidence,
        timestamp: Date.now(),
        processedBy: recognitionSource,
      }).catch((error) => logger.debug('Failed to log successful gesture', error));

      await runRecognitionFeedback(gesture, label, smoothedConfidence);

      handlePostRecognitionFollowups(gesture, smoothedConfidence, landmarks, handedness);
    },
    [
      handlePostRecognitionFollowups,
      runRecognitionFeedback,
      setPendingGesture,
      setShowVisualRipple,
      setDetectedGestureMeaning,
      showSuccessfulGestureUi,
      setError,
    ],
  );

  const handleGestureDetected = useCallback(
    async (
      rawGesture: string | null,
      confidence: number,
      landmarks: number[][][],
      handedness: string[],
      recognitionSource: RecognitionPath = 'local',
    ) => {
      try {
        refs.lastFrameTimeRef.current = Date.now();
        setCurrentLandmarks(landmarks);
        setCurrentHandedness(handedness);

        const nowSeconds = Date.now() / 1000;
        const normalizedInputConfidence = sanitizeConfidence(confidence) ?? 0;
        const filteredConfidence = refs.confidenceFilterRef.current.filter(
          normalizedInputConfidence,
          nowSeconds,
        );
        const normalizedFilteredConfidence = sanitizeConfidence(filteredConfidence);
        const smoothedConfidence = normalizedFilteredConfidence ?? normalizedInputConfidence;
        setGestureConfidence(smoothedConfidence);

        if (landmarks.length) {
          setShowVisualRipple(true);
          clearVisualRippleTimeout();
          visualRippleTimeout.current = setTimeout(() => {
            setShowVisualRipple(false);
            visualRippleTimeout.current = null;
          }, VISUAL_RIPPLE_RESET_DELAY_MS);
        }

        const gesture = normalizeGestureId(rawGesture);
        if (!gesture) {
          scheduleActiveGestureClear();
          setPendingGesture(null);
          setDetectedGestureMeaning(null);
          if (smoothedConfidence < WAITING_CONFIDENCE_THRESHOLD) {
            setError(null);
          }
          return;
        }

        refs.labelHistoryRef.current = [...refs.labelHistoryRef.current.slice(-4), gesture];
        setPendingGesture(gesture);
        contextAwareRecognitionService.recordGesture(
          gesture,
          smoothedConfidence,
          refs.lastGestureIdRef.current || undefined,
        );
        setContextInsights(contextAwareRecognitionService.getInsights());

        const thresholdInfo = personalizedConfidenceService.getPersonalizedThreshold(gesture, smoothedConfidence);
        const meetsThreshold = smoothedConfidence >= thresholdInfo.threshold;

        if (!meetsThreshold) {
          scheduleActiveGestureClear();
          setDetectedGestureMeaning(null);
          handleLowConfidenceGesture(gesture, smoothedConfidence, thresholdInfo.threshold, landmarks);
          return;
        }

        clearEncouragementTimeout();

        if (refs.activeGestureRef.current === gesture) {
          return;
        }

        if (
          refs.lastGestureIdRef.current === gesture &&
          Date.now() - refs.lastSuccessAtRef.current < RECENT_GESTURE_SUPPRESS_MS
        ) {
          return;
        }

        cancelActiveGestureClear();
        refs.activeGestureRef.current = gesture;
        refs.lastGestureIdRef.current = gesture;
        refs.lastSuccessAtRef.current = Date.now();

        await handleSuccessfulGesture(
          gesture,
          smoothedConfidence,
          landmarks,
          handedness,
          recognitionSource,
        );
        setLastSuccessfulConfidence(smoothedConfidence);
      } catch (error) {
        logger.error('handleGestureDetected failed', error);
        refs.activeGestureRef.current = null;
        setError(PREDICTION_ERROR_TEXT);
      }
    },
    [
      cancelActiveGestureClear,
      clearEncouragementTimeout,
      clearVisualRippleTimeout,
      handleLowConfidenceGesture,
      handleSuccessfulGesture,
      refs,
      setCurrentLandmarks,
      setCurrentHandedness,
      setGestureConfidence,
      setShowVisualRipple,
      setPendingGesture,
      setStatus,
      helpers,
      setRecognitionPath,
      setLastRecognizedGesture,
      setContextInsights,
      setDetectedGestureMeaning,
      setGestureSuggestions,
      setShowAdaptiveLearning,
      setShortcutActivated,
      setShowScreenFlash,
      setScreenFlashPattern,
      setError,
      scheduleActiveGestureClear,
      setLastSuccessfulConfidence,
    ],
  );

  const handleModelUpdateStatus = useCallback(
    (status: 'idle' | 'updating' | 'complete' | 'error') => {
      setModelUpdateStatus(status);
      switch (status) {
        case 'updating':
          setStatus('🔄 Ich lade ein neues Modell…');
          break;
        case 'complete':
          refs.lastModelUpdateTimeRef.current = Date.now();
          setStatus('✅ Neues Modell einsatzbereit!');
          void zeroDowntimeModelService.activatePendingModel().catch((error) =>
            logger.error('Failed to activate pending model', error),
          );
          break;
        case 'error':
          setError('⚠️ Modellaktualisierung fehlgeschlagen.');
          void emergencyRollback().catch((error) =>
            logger.warn('Emergency rollback failed', error),
          );
          break;
        default:
          setStatus('Ich höre zu…');
      }
    },
    [refs.lastModelUpdateTimeRef, setError, setModelUpdateStatus, setStatus],
  );

  const handlePartialFeedback = useCallback(
    (gesture: string, completion: number, feedback: string) => {
      setPendingGesture(gesture);
      setStatus(feedback);
      void partialGestureHapticFeedback(completion).catch((error) =>
        logger.debug('Partial feedback haptics failed', error),
      );

      void audioService.playSuccessFeedback(gesture, completion).catch((error: unknown) =>
        logger.debug('Optional success feedback failed', error),
      );
    },
    [setPendingGesture, setStatus],
  );

  const handleStabilityFeedback = useCallback(
    (isStable: boolean, stabilityScore: number, feedback: string) => {
      if (isStable) {
        setStatus(feedback);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error) =>
          logger.debug('Stability feedback failed', error),
        );
      } else if (stabilityScore < 0.3) {
        setStatus('Bleib kurz still – ich fokussiere mich.');
      }
    },
    [setStatus],
  );

  const handleGestureError = useCallback(
    async (errorMessage: string, details?: MediaPipeErrorDetails) => {
      logger.warn('Recognition WebView error', {
        errorMessage,
        reason: details?.reason ?? null,
      });
      setError(PREDICTION_ERROR_TEXT);
      setStatus(RECOVERING_CAMERA_TEXT);
      const recovered = await automaticRecoveryService.attemptRecovery(errorMessage, 'recognition_webview');
      if (!recovered) {
        setWebviewRetries((retries) => {
          const next = retries + 1;
          if (next >= 3) {
            setWebviewKey((key) => key + 1);
            return 0;
          }
          return next;
        });
      }
    },
    [setError, setStatus, setWebviewKey, setWebviewRetries],
  );

  const handleSelectCorrection = useCallback(
    async (choiceId: string) => {
      setShowCorrection(false);
      setStatus('Danke für deine Hilfe! Ich lerne daraus.');
      activeLearningService.recordMisclassification(
        choiceId,
        refs.lastGestureIdRef.current ?? choiceId,
        gestureConfidence,
        'user',
        {
          timeOfDay: new Date().getHours(),
          activityLevel: 'normal',
          consecutiveFailures: 1,
        },
      );
      await correctionService.logCorrection(choiceId).catch((error) =>
        logger.warn('Failed to log correction', error),
      );
      navigation.navigate(ROOT_STACK_ROUTES.Training, { gestureLabel: choiceId });
    },
    [gestureConfidence, navigation, refs, setShowCorrection, setStatus],
  );

  const handleAcceptPractice = useCallback(() => {
    setShowPracticeSuggestion(false);
    navigation.navigate(ROOT_STACK_ROUTES.Training, { isPractice: true });
  }, [navigation, setShowPracticeSuggestion]);

  const handleDeclinePractice = useCallback(() => {
    setShowPracticeSuggestion(false);
  }, [setShowPracticeSuggestion]);

  const handleLaterPractice = useCallback(() => {
    setShowPracticeSuggestion(false);
  }, [setShowPracticeSuggestion]);

  const handleStartAdaptiveRecommendation = useCallback(
    (recommendation: { gesture?: string; type?: string }) => {
      setShowAdaptiveLearning(false);
      if (recommendation?.gesture) {
        navigation.navigate(ROOT_STACK_ROUTES.Training, {
          gestureLabel: recommendation.gesture,
          isPractice: true,
        });
      }
    },
    [navigation, setShowAdaptiveLearning],
  );

  return {
    handleGestureDetected,
    handleModelUpdateStatus,
    handlePartialFeedback,
    handleStabilityFeedback,
    handleGestureError,
    handleSelectCorrection,
    handleAcceptPractice,
    handleDeclinePractice,
    handleLaterPractice,
    handleStartAdaptiveRecommendation,
  };
};

export type UseRecognitionCallbacksReturn = ReturnType<typeof useRecognitionCallbacks>;
