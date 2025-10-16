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
  dialogEngine,
  LanguageManager,
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
import type { RecognitionPath } from '../utils/recognitionState';
import type { TabNavigationProp } from '../navigation/types';
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

type Navigation = TabNavigationProp<'Recognition'>;

interface RecognitionRefs {
  confidenceFilterRef: MutableRefObject<OneEuroFilter>;
  labelHistoryRef: MutableRefObject<string[]>;
  lastGestureIdRef: MutableRefObject<string | null>;
  lastSuccessAtRef: MutableRefObject<number>;
  lastFrameTimeRef: MutableRefObject<number>;
  lastModelUpdateTimeRef: MutableRefObject<number>;
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

const normalizeGestureId = (gesture: string | null): string | null => {
  if (!gesture) return null;
  return gesture.trim().toLowerCase();
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
    setSuggestions,
    setDialogContext,
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
    dialogContext,
    lastRecognizedGesture,
    profile,
  } = state;

  const encouragementTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenFlashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualRippleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    },
    [clearEncouragementTimeout, clearScreenFlashTimeout, clearVisualRippleTimeout],
  );

  const handleLowConfidenceGesture = useCallback(
    (
      gesture: string,
      smoothedConfidence: number,
      threshold: number,
      landmarks: number[][][],
    ) => {
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

      const suggestionLanguage = LanguageManager.getLanguage();
      const suggestionAge = profile?.age ?? 4;

      try {
        const suggestions = await dialogEngine.getSuggestions({
          input: label,
          context: dialogContext,
          language: suggestionLanguage,
          age: suggestionAge,
        });
        setSuggestions(suggestions);
        setDialogContext((ctx) => {
          const next = [...ctx, label];
          return next.slice(-5);
        });
      } catch (error) {
        logger.warn('Failed to get LLM suggestions:', error);
      }

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
      setSuggestions,
      setDialogContext,
      dialogContext,
      showSuccessfulGestureUi,
      profile,
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

        const smoothedConfidence = refs.confidenceFilterRef.current.filter(confidence, Date.now() / 1000);
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
          setPendingGesture(null);
          setDetectedGestureMeaning(null);
          if (smoothedConfidence < WAITING_CONFIDENCE_THRESHOLD) {
            setStatus(WAITING_STATUS);
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
          setDetectedGestureMeaning(null);
          handleLowConfidenceGesture(gesture, smoothedConfidence, thresholdInfo.threshold, landmarks);
          return;
        }

        clearEncouragementTimeout();

        if (
          refs.lastGestureIdRef.current === gesture &&
          Date.now() - refs.lastSuccessAtRef.current < RECENT_GESTURE_SUPPRESS_MS
        ) {
          return;
        }

        refs.lastGestureIdRef.current = gesture;
        refs.lastSuccessAtRef.current = Date.now();

        await handleSuccessfulGesture(
          gesture,
          smoothedConfidence,
          landmarks,
          handedness,
          recognitionSource,
        );
      } catch (error) {
        logger.error('handleGestureDetected failed', error);
        setError(PREDICTION_ERROR_TEXT);
      }
    },
    [
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
    async (errorMessage: string) => {
      logger.warn('Recognition WebView error', { errorMessage });
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
      navigation.navigate('Teaching', { gestureId: choiceId });
    },
    [gestureConfidence, navigation, refs, setShowCorrection, setStatus],
  );

  const handleAcceptPractice = useCallback(() => {
    setShowPracticeSuggestion(false);
    navigation.navigate('Teaching');
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
        navigation.navigate('Teaching', { gestureId: recommendation.gesture });
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
