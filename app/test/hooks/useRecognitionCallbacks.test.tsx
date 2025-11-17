import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react-native';

import { useRecognitionCallbacks, type UseRecognitionCallbacksArgs } from '../../src/hooks/useRecognitionCallbacks';
type RecognitionState = UseRecognitionCallbacksArgs['state'];

type RecognitionRefs = UseRecognitionCallbacksArgs['refs'];

type RecognitionHelpers = UseRecognitionCallbacksArgs['helpers'];

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/services', () => ({
  audioService: {
    playSound: jest.fn().mockResolvedValue(undefined),
    playSuccessFeedback: jest.fn().mockResolvedValue(undefined),
  },
  triggerSpeakAndShow: jest.fn().mockResolvedValue(undefined),
  announceGestureRecognition: jest.fn(),
  detectionHapticFeedback: jest.fn().mockResolvedValue(undefined),
  partialGestureHapticFeedback: jest.fn().mockResolvedValue(undefined),
  multiSensoryFeedback: jest.fn().mockResolvedValue(undefined),
  personalizedConfidenceService: {
    getPersonalizedThreshold: jest.fn(() => ({
      threshold: 0.2,
      reason: 'mock',
      confidence: 'high',
      adjustments: [],
    })),
  },
  gestureCombinationService: {
    processGesture: jest.fn().mockReturnValue(null),
  },
  correctionService: {
    logCorrection: jest.fn().mockResolvedValue(undefined),
  },
  gestureMeaningService: {
    processGestureMeaning: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/services/gestureHistoryService', () => ({
  gestureHistoryService: {
    addGesture: jest.fn(),
  },
}));

jest.mock('../../src/services/automaticRecoveryService', () => ({
  automaticRecoveryService: {
    attemptRecovery: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../src/services/zeroDowntimeModelService', () => ({
  zeroDowntimeModelService: {
    activatePendingModel: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/services/optimizedGestureService', () => ({
  optimizedGestureService: {
    getGestureById: jest.fn().mockImplementation((gesture: string) => ({
      id: gesture,
      label: gesture,
      emoji: '👋',
    })),
  },
}));

jest.mock('../../src/services/hipEvents', () => ({
  logHIPEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/modelUpdate', () => ({
  emergencyRollback: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/contextAwareRecognitionService', () => ({
  contextAwareRecognitionService: {
    recordGesture: jest.fn(),
    getInsights: jest.fn().mockReturnValue({}),
  },
}));

jest.mock('../../src/services/activeLearningService', () => ({
  activeLearningService: {
    recordUncertainSample: jest.fn(),
    recordPracticeResults: jest.fn(),
    recordMisclassification: jest.fn(),
  },
}));

jest.mock('../../src/services/adaptiveLearningService', () => ({
  adaptiveLearningService: {
    getAdaptiveRecommendations: jest.fn().mockReturnValue([]),
  },
}));

jest.mock('../../src/services/gestureSuggester', () => ({
  __esModule: true,
  default: {
    getSuggestions: jest.fn().mockReturnValue([]),
  },
}));

jest.mock('../../src/services/healthScore', () => ({
  shouldPromptPractice: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../src/services/analytics', () => ({
  logInteractionEvent: jest.fn().mockResolvedValue(undefined),
}));

const services = jest.requireMock('../../src/services');
const analytics = jest.requireMock('../../src/services/analytics');
const hipEvents = jest.requireMock('../../src/services/hipEvents');
const adaptiveService = jest.requireMock('../../src/services/adaptiveLearningService');
const gestureSuggesterModule = jest.requireMock('../../src/services/gestureSuggester');
const healthScore = jest.requireMock('../../src/services/healthScore');
const { logger } = jest.requireMock('../../src/utils/logger');
const recovery = jest.requireMock('../../src/services/automaticRecoveryService');
const { gestureHistoryService } = jest.requireMock('../../src/services/gestureHistoryService');

describe('useRecognitionCallbacks', () => {
  let state: RecognitionState;
  let refs: RecognitionRefs;
  let helpers: RecognitionHelpers;
  const navigate = jest.fn();
  const setStatus = jest.fn();
  const setPendingGesture = jest.fn();
  const setGestureSuggestions = jest.fn();
  const setShowCorrection = jest.fn();
  const setShowPracticeSuggestion = jest.fn();
  const setShowAdaptiveLearning = jest.fn();
  const setWebviewRetries = jest.fn((updater: unknown) => {
    if (typeof updater === 'function') {
      return (updater as (value: number) => number)(0);
    }
    return updater;
  });
  const setWebviewKey = jest.fn((updater: unknown) => {
    if (typeof updater === 'function') {
      return (updater as (value: number) => number)(0);
    }
    return updater;
  });
  const setError = jest.fn();
  const setGestureConfidence = jest.fn();
  const setLastRecognizedGesture = jest.fn();
  const setRecognitionPath = jest.fn();
  const setShowVisualRipple = jest.fn();
  const setShowScreenFlash = jest.fn();
  const setScreenFlashPattern = jest.fn();
  const setShortcutActivated = jest.fn();
  const setCurrentLandmarks = jest.fn();
  const setCurrentHandedness = jest.fn();
  const setModelUpdateStatus = jest.fn();
  const setContextInsights = jest.fn();
  const setDetectedGestureMeaning = jest.fn();
  const setSequenceMeaning = jest.fn();
  const setSequenceMatch = jest.fn();
  const setLastSuccessfulConfidence = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (services.personalizedConfidenceService.getPersonalizedThreshold as jest.Mock).mockImplementation(() => ({
      threshold: 0.2,
      reason: 'mock',
      confidence: 'high',
      adjustments: [],
    }));
    (analytics.logInteractionEvent as jest.Mock).mockResolvedValue(undefined);
    (hipEvents.logHIPEvent as jest.Mock).mockResolvedValue(undefined);
    (services.detectionHapticFeedback as jest.Mock).mockResolvedValue(undefined);
    (services.partialGestureHapticFeedback as jest.Mock).mockResolvedValue(undefined);
    (adaptiveService.adaptiveLearningService.getAdaptiveRecommendations as jest.Mock).mockReturnValue([]);
    (gestureSuggesterModule.default.getSuggestions as jest.Mock).mockReturnValue([]);
    (healthScore.shouldPromptPractice as jest.Mock).mockResolvedValue(false);

    jest.useFakeTimers();

    state = {
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
      setLastSuccessfulConfidence,
      successSound: null,
      contextInsights: {},
      gestureConfidence: 0,
      lastSuccessfulConfidence: 0,
      lastRecognizedGesture: null,
      profile: { age: 5 },
    } as unknown as RecognitionState;

    refs = {
      confidenceFilterRef: {
        current: {
          filter: jest.fn(() => 0.9),
        },
      },
      labelHistoryRef: {
        current: [],
      },
      lastGestureIdRef: {
        current: null,
      },
      lastSuccessAtRef: {
        current: 0,
      },
      lastFrameTimeRef: {
        current: 0,
      },
      lastModelUpdateTimeRef: {
        current: 0,
      },
      activeGestureRef: {
        current: null,
      },
    } as RecognitionRefs;

    helpers = {
      startFeedbackAnimation: jest.fn(),
      getSuccessMessage: jest.fn().mockReturnValue('Super gemacht!'),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderHookHarness = async () => {
    let callbacks: ReturnType<typeof useRecognitionCallbacks> | null = null;

    const Harness: React.FC<{ onReady: (value: ReturnType<typeof useRecognitionCallbacks>) => void }> = ({
      onReady,
    }) => {
      const hookValue = useRecognitionCallbacks({
        navigation: { navigate } as never,
        state,
        refs,
        helpers,
      });

      useEffect(() => {
        onReady(hookValue);
      }, [hookValue, onReady]);

      return null;
    };

    render(<Harness onReady={(value) => { callbacks = value; }} />);

    await act(async () => {});

    if (!callbacks) {
      throw new Error('useRecognitionCallbacks did not initialize');
    }

    return callbacks;
  };

  it('clears the error after a successful gesture following a failure', async () => {
    const callbacks = await renderHookHarness();

    await act(async () => {
      await callbacks.handleGestureError('Test error');
    });

    expect(setError).toHaveBeenCalledWith('Das hat nicht geklappt. Lass es uns nochmal versuchen!');

    await act(async () => {
      await callbacks.handleGestureDetected('winken', 0.95, [[[0]]], ['left']);
    });

    const lastCall = setError.mock.calls[setError.mock.calls.length - 1];
    expect(lastCall[0]).toBeNull();
    expect(setLastSuccessfulConfidence).toHaveBeenCalledWith(0.9);
  });

  it('logs detailed gesture errors and attempts automatic recovery', async () => {
    const callbacks = await renderHookHarness();

    await act(async () => {
      await callbacks.handleGestureError('MediaPipe failure', {
        reason: 'media_recorder_not_supported',
      });
    });

    expect(logger.warn).toHaveBeenCalledWith('Recognition WebView error', {
      errorMessage: 'MediaPipe failure',
      reason: 'media_recorder_not_supported',
    });

    const lastErrorCall = setError.mock.calls[setError.mock.calls.length - 1];
    expect(lastErrorCall[0]).toBe('Das hat nicht geklappt. Lass es uns nochmal versuchen!');

    const lastStatusCall = setStatus.mock.calls[setStatus.mock.calls.length - 1];
    expect(lastStatusCall[0]).toBe('Ups! Ich starte die Kamera neu…');

    expect(
      recovery.automaticRecoveryService.attemptRecovery,
    ).toHaveBeenCalledWith('MediaPipe failure', 'recognition_webview');
  });

  it('holds the active gesture briefly to avoid duplicate feedback when detection drops', async () => {
    const callbacks = await renderHookHarness();

    await act(async () => {
      await callbacks.handleGestureDetected('winken', 0.95, [[[0]]], ['left']);
    });

    expect(gestureHistoryService.addGesture).toHaveBeenCalledTimes(1);

    await act(async () => {
      await callbacks.handleGestureDetected(null, 0.05, [], []);
    });

    expect(gestureHistoryService.addGesture).toHaveBeenCalledTimes(1);

    await act(async () => {
      await callbacks.handleGestureDetected('winken', 0.96, [[[0]]], ['left']);
    });

    expect(gestureHistoryService.addGesture).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await act(async () => {
      await callbacks.handleGestureDetected('winken', 0.97, [[[0]]], ['left']);
    });

    expect(gestureHistoryService.addGesture).toHaveBeenCalledTimes(2);
  });
});
