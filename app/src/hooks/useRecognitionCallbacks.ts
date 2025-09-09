import { useCallback } from 'react';
import {
  audioService,
  triggerSpeakAndShow,
  correctionService,
  dialogEngine,
  announceGestureRecognition,
  gestureSuggester,
  detectionHapticFeedback,
  partialGestureHapticFeedback,
  multiSensoryFeedback,
   activeLearningService,
   adaptiveLearningService,
   personalizedConfidenceService,
  gestureCombinationService,
} from '../services';
import { gestureHistoryService } from '../services/gestureHistoryService';
import { automaticRecoveryService } from '../services/automaticRecoveryService';
import { zeroDowntimeModelService } from '../services/zeroDowntimeModelService';
import { emergencyPriorityService } from '../services/emergencyPriorityService';
import { preCachedResponseService } from '../services/preCachedResponseService';
import { optimizedGestureService } from '../services/optimizedGestureService';
import { logHIPEvent } from '../services/hipEvents';
import { emergencyRollback } from '../services/modelUpdate';
import { LanguageManager } from '../services/LanguageManager';
import * as Haptics from 'expo-haptics';

export const useRecognitionCallbacks = (state: any, setState: any, navigation: any) => {
  const { 
    pendingGesture,
    gestureConfidence,
    screenReaderEnabled,
    startFeedbackAnimation,
    profile,
    successSound,
    getSuccessMessage,
    fadeAnim,
    contextInsights,
    getAdaptiveGuidanceDuration,
    getContextualGestureSuggestion,
    getShortcutAction,
    getShortcutDisplayName,
    showPipGuidance,
    showSlowMotionReplay,
    provideInstantFeedback,
    showCorrection,
    labelHistoryRef,
    lastModelUpdateTimeRef,
    webviewRetries,
  } = state;

  const { 
    setStatus,
    setPendingGesture,
    setGestureSuggestions,
    setShowCorrection,
    setComparisonAttempt,
    setShowGestureComparison,
    setShowPracticeSuggestion,
    setShowAdaptiveLearning,
    setSlowMotionGesture,
    setShowSlowMotionReplay,
    setWebviewRetries,
    setWebviewKey,
    setError,
  } = setState;

  const handleGestureDetected = useCallback(async (
    gesture: string | null,
    confidence: number,
    landmarks: number[][][],
    handedness: string[],
    emergency = false,
  ) => {
    // ... (handleGestureDetected logic)
  }, [
    // ... (dependencies)
  ]);

  const handleModelUpdateStatus = useCallback((status: 'idle' | 'updating' | 'complete' | 'error') => {
    // ... (handleModelUpdateStatus logic)
  }, []);

  const handlePartialFeedback = useCallback((gesture: string, completion: number, feedback: string) => {
    // ... (handlePartialFeedback logic)
  }, [screenReaderEnabled]);

  const handleStabilityFeedback = useCallback((isStable: boolean, stabilityScore: number, feedback: string) => {
    // ... (handleStabilityFeedback logic)
  }, []);

  const handleGestureError = useCallback(async (errorMessage: string) => {
    // ... (handleGestureError logic)
  }, [webviewRetries]);

  const handleSelectCorrection = async (choiceId: string) => {
    // ... (handleSelectCorrection logic)
  };

  const handleCloseComparison = () => {
    setShowGestureComparison(false);
    setComparisonAttempt(null);
  };

  const handleAcceptPractice = () => {
    setShowPracticeSuggestion(false);
    // Navigate to practice mode with the suggested gesture
    navigation.navigate('Teaching');
  };

  const handleDeclinePractice = () => {
    setShowPracticeSuggestion(false);
  };

  const handleLaterPractice = () => {
    setShowPracticeSuggestion(false);
    // Could schedule for later, but for now just hide
  };

  const handleStartAdaptiveRecommendation = (recommendation: any) => {
    setShowAdaptiveLearning(false);
    // Navigate based on recommendation type
    if (recommendation.gesture) {
      navigation.navigate('Teaching');
    } else if (recommendation.type === 'break') {
      // Could show a break activity or just close
      setStatus('Nimm dir eine kurze Pause! ☕');
      setTimeout(() => setStatus('Ich höre zu…'), 5000);
    }
  };

  const handleTryAgainFromComparison = () => {
    setShowGestureComparison(false);
    setComparisonAttempt(null);
    setStatus('Versuch\'s nochmal! Du schaffst das!');
  };

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
