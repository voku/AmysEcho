import { useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { NavigationProp } from '@react-navigation/native';
import { LanguageManager } from '../services/LanguageManager';
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
} from '../services';
import { gestureHistoryService } from '../services/gestureHistoryService';
import { automaticRecoveryService } from '../services/automaticRecoveryService';
import { zeroDowntimeModelService } from '../services/zeroDowntimeModelService';
import { emergencyPriorityService } from '../services/emergencyPriorityService';
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
import type { RecognitionState, ScreenFlashPattern } from './useRecognitionState';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NavigationProp<RootStackParamList, 'Recognition'>;

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

const SUCCESS_FLASH: ScreenFlashPattern = 'success';
const ENCOURAGEMENT_STATUS = 'Fast! Mach weiter so – ich sehe deine Hände!';
const WAITING_STATUS = 'Ich suche deine Hände…';

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
    setComparisonAttempt,
    setShowGestureComparison,
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
    setShowPipGuidance,
    setPipGuidanceGesture,
    setCurrentLandmarks,
    setCurrentHandedness,
  } = state;

  const { successSound, contextInsights, screenReaderEnabled, showPipGuidance, gestureConfidence } = state;

  const encouragementTimeout = useMemo<{ current: ReturnType<typeof setTimeout> | null }>(
    () => ({ current: null }),
    [],
  );

  const handleGestureDetected = useCallback(
    async (
      rawGesture: string | null,
      confidence: number,
      landmarks: number[][][],
      handedness: string[],
      emergency = false,
    ) => {
      try {
        refs.lastFrameTimeRef.current = Date.now();
        setCurrentLandmarks(landmarks);
        setCurrentHandedness(handedness);

        const smoothedConfidence = refs.confidenceFilterRef.current.filter(confidence, Date.now() / 1000);
        setGestureConfidence(smoothedConfidence);

        if (landmarks.length) {
          setShowVisualRipple(true);
          setTimeout(() => setShowVisualRipple(false), 280);
        }

        const gesture = normalizeGestureId(rawGesture);
        if (!gesture) {
          setPendingGesture(null);
          if (smoothedConfidence < 0.15) {
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

        const thresholdInfo = personalizedConfidenceService.getPersonalizedThreshold(gesture, smoothedConfidence);
        const meetsThreshold = emergency || smoothedConfidence >= thresholdInfo.threshold;

        if (!meetsThreshold) {
          activeLearningService.recordUncertainSample(gesture, smoothedConfidence, landmarks, {
            timeOfDay: new Date().getHours(),
            activityLevel: 'normal',
            consecutiveFailures: 1,
          });
          setStatus(ENCOURAGEMENT_STATUS);
          setShowScreenFlash(false);
          setScreenFlashPattern('pulse');
          void detectionHapticFeedback();
          if (smoothedConfidence > thresholdInfo.threshold - 0.05) {
            void partialGestureHapticFeedback(smoothedConfidence).catch((error) =>
              logger.debug('Partial haptic feedback failed', error),
            );
          }

          if (!showPipGuidance) {
            const suggestion = optimizedGestureService.getGestureById(gesture);
            if (suggestion) {
              setPipGuidanceGesture(suggestion);
              setShowPipGuidance(true);
            }
          }

          if (!encouragementTimeout.current) {
            encouragementTimeout.current = setTimeout(() => {
              encouragementTimeout.current = null;
              setShowPracticeSuggestion(true);
            }, 2000);
          }

          return;
        }

        if (encouragementTimeout.current) {
          clearTimeout(encouragementTimeout.current);
          encouragementTimeout.current = null;
        }

        if (
          refs.lastGestureIdRef.current === gesture &&
          Date.now() - refs.lastSuccessAtRef.current < 1000
        ) {
          return;
        }

        refs.lastGestureIdRef.current = gesture;
        refs.lastSuccessAtRef.current = Date.now();
        setPendingGesture(null);
        setShowVisualRipple(false);

        const gestureMeta = optimizedGestureService.getGestureById(gesture);
        const label = gestureMeta?.label || gesture;
        const emoji = gestureMeta?.emoji || '🤟';

        setRecognitionPath('local');
        setLastRecognizedGesture(gestureMeta ?? null);
        setStatus(helpers.getSuccessMessage(gesture));
        helpers.startFeedbackAnimation();
        setScreenFlashPattern(SUCCESS_FLASH);
        setShowScreenFlash(true);
        setTimeout(() => setShowScreenFlash(false), 600);

        gestureHistoryService.addGesture({
          id: gesture,
          label,
          emoji,
          confidence: smoothedConfidence,
          landmarks,
          audioResponse: successSound,
        });

        announceGestureRecognition(label, smoothedConfidence);

        await Promise.all([
          multiSensoryFeedback(gesture, smoothedConfidence, {
            ...contextInsights,
            isEmergency: emergency,
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

        void logHIPEvent('HIP_1', 'gesture_recognized', {
          gesture,
          confidence: smoothedConfidence,
          emergency,
        });

        if (emergency) {
          emergencyPriorityService.addEmergencyGesture(gesture, smoothedConfidence);
        }

        activeLearningService.recordPracticeResults(gesture, smoothedConfidence);

        const sequence = gestureCombinationService.processGesture(gesture, smoothedConfidence);
        if (sequence?.sequence) {
          setStatus(`✨ ${sequence.sequence.combinedMeaning}`);
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
          setGestureSuggestions(suggestions.map(({ id, label }) => ({ id, label })));
          setShowCorrection(true);
        }

        setShortcutActivated(null);
      } catch (error) {
        logger.error('handleGestureDetected failed', error);
        setError(LanguageManager.t('mediapipe.predictionError'));
      }
    },
    [
      refs,
      setCurrentLandmarks,
      setCurrentHandedness,
      setGestureConfidence,
      setShowVisualRipple,
      setPendingGesture,
      setStatus,
      showPipGuidance,
      setShowPipGuidance,
      setPipGuidanceGesture,
      setShowPracticeSuggestion,
      encouragementTimeout,
      helpers,
      setRecognitionPath,
      setLastRecognizedGesture,
      contextInsights,
      successSound,
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
      state.setModelUpdateStatus(status);
      switch (status) {
        case 'updating':
          setStatus('🔄 Ich lade ein neues Modell…');
          break;
        case 'complete':
          refs.lastModelUpdateTimeRef.current = Date.now();
          setStatus('✅ Neues Modell einsatzbereit!');
          void zeroDowntimeModelService.activatePendingModel();
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
    [refs.lastModelUpdateTimeRef, setError, setStatus, state],
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
    [screenReaderEnabled, setPendingGesture, setStatus],
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
      setError(errorMessage);
      setStatus('Ups! Ich starte die Kamera neu…');
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
      navigation.navigate('Teaching', { gestureId: choiceId } as any);
    },
    [navigation, setShowCorrection, setStatus],
  );

  const handleCloseComparison = useCallback(() => {
    setShowGestureComparison(false);
    setComparisonAttempt(null);
  }, [setComparisonAttempt, setShowGestureComparison]);

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
        navigation.navigate('Teaching', { gestureId: recommendation.gesture } as any);
      } else if (recommendation?.type === 'break') {
        setStatus('Nimm dir kurz Zeit – ich bleibe bereit.');
      }
    },
    [navigation, setShowAdaptiveLearning, setStatus],
  );

  const handleTryAgainFromComparison = useCallback(() => {
    setShowGestureComparison(false);
    setComparisonAttempt(null);
    setStatus("Versuch's nochmal! Du schaffst das!");
  }, [setComparisonAttempt, setShowGestureComparison, setStatus]);

  return {
    handleGestureDetected,
    handleModelUpdateStatus,
    handlePartialFeedback,
    handleStabilityFeedback,
    handleGestureError,
    handleSelectCorrection,
    handleCloseComparison,
    handleAcceptPractice,
    handleDeclinePractice,
    handleLaterPractice,
    handleStartAdaptiveRecommendation,
    handleTryAgainFromComparison,
  };
};

export type UseRecognitionCallbacksReturn = ReturnType<typeof useRecognitionCallbacks>;
