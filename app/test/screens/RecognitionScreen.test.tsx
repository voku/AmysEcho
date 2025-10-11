import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    AccessibilityInfo: {
      isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      removeEventListener: jest.fn(),
    },
  };
});

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ showToast: jest.fn() }),
}));

jest.mock('../../src/utils/themeMessages', () => ({
  useThemeMessages: () => ({ getSuccessMessage: () => 'Großartig gemacht!' }),
}));

jest.mock('../../src/components/LazyComponent', () => ({
  usePreloadComponents: () => undefined,
}));

jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/components/CorrectionPanel', () => () => null);
jest.mock('../../src/components/PracticeSuggestion', () => () => null);
jest.mock('../../src/components/AdaptiveLearningPanel', () => () => null);
jest.mock('../../src/components/VisualRipple', () => () => null);
jest.mock('../../src/components/ScreenFlash', () => () => null);
jest.mock('../../src/components/GestureMeaningDisplay', () => () => null);
jest.mock('../../src/components/ScreenBackground', () => ({ children }: any) => children);
jest.mock('../../src/components/HandLandmarkPreview', () => () => null);
jest.mock('../../src/components/Celebration', () => () => null);

jest.mock('../../src/components/MediaPipeGestureDetector', () => ({
  MediaPipeGestureDetector: () => null,
}));

jest.mock('../../src/services/optimizedGestureService', () => ({
  optimizedGestureService: {
    getGestureById: jest.fn(() => ({ emoji: '👋' })),
  },
}));

jest.mock('../../src/storage', () => ({
  loadProfile: () => Promise.resolve(null),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../../src/hooks/useRecognitionCallbacks', () => ({
  useRecognitionCallbacks: () => ({
    handleGestureDetected: jest.fn(),
    handleModelUpdateStatus: jest.fn(),
    handleGestureError: jest.fn(),
    handleSelectCorrection: jest.fn(),
    handleAcceptPractice: jest.fn(),
    handleDeclinePractice: jest.fn(),
    handleLaterPractice: jest.fn(),
    handleStartAdaptiveRecommendation: jest.fn(),
  }),
}));

jest.mock('../../src/hooks/useOpenAIValidation', () => ({
  useOpenAIValidation: () => ({
    openaiValidationResult: null,
    setOpenaiValidationResult: jest.fn(),
    showOpenaiFeedback: false,
    setShowOpenaiFeedback: jest.fn(),
    handleOpenAIValidation: jest.fn(),
  }),
}));

jest.mock('../../src/hooks/useParallelProcessing', () => ({
  useParallelProcessing: () => ({
    handleParallelProcessing: jest.fn(),
  }),
}));

jest.mock('../../src/hooks/useRecognitionState', () => {
  const React = require('react');
  const actual = jest.requireActual('../../src/hooks/useRecognitionState');

  let setLastRecognizedGestureMock: ((gesture: any) => void) | null = null;

  const recognizedGestureTemplate = {
    id: 'hallo',
    label: 'Hallo',
    emoji: '👋',
    category: 'greeting',
  };

  const useRecognitionState = () => {
    const [lastRecognizedGesture, setLastRecognizedGesture] =
      React.useState<any>(null);

    setLastRecognizedGestureMock = setLastRecognizedGesture;

    return {
      profile: null,
      setProfile: jest.fn(),
      status: 'Ich höre zu…',
      setStatus: jest.fn(),
      gestureConfidence: 0.9,
      setGestureConfidence: jest.fn(),
      error: null,
      setError: jest.fn(),
      showCorrection: false,
      setShowCorrection: jest.fn(),
      gestureSuggestions: [],
      setGestureSuggestions: jest.fn(),
      pendingGesture: null,
      setPendingGesture: jest.fn(),
      lastRecognizedGesture,
      setLastRecognizedGesture,
      facingMode: 'user',
      setFacingMode: jest.fn(),
      webviewKey: 0,
      setWebviewKey: jest.fn(),
      webviewRetries: 0,
      setWebviewRetries: jest.fn(),
      recognitionPath: 'local',
      setRecognitionPath: jest.fn(),
      showCelebration: false,
      setShowCelebration: jest.fn(),
      celebrationKey: 0,
      setCelebrationKey: jest.fn(),
      modelUpdateStatus: 'idle',
      setModelUpdateStatus: jest.fn(),
      gestureSizeTolerance: 0.3,
      setGestureSizeTolerance: jest.fn(),
      showVisualRipple: false,
      setShowVisualRipple: jest.fn(),
      successSound: 'success',
      setSuccessSound: jest.fn(),
      showScreenFlash: false,
      setShowScreenFlash: jest.fn(),
      screenFlashPattern: actual.ScreenFlashPattern.Single,
      setScreenFlashPattern: jest.fn(),
      shortcutActivated: null,
      setShortcutActivated: jest.fn(),
      showPracticeSuggestion: false,
      setShowPracticeSuggestion: jest.fn(),
      showAdaptiveLearning: false,
      setShowAdaptiveLearning: jest.fn(),
      contextInsights: null,
      setContextInsights: jest.fn(),
      detectedGestureMeaning: null,
      setDetectedGestureMeaning: jest.fn(),
      sequenceMeaning: null,
      setSequenceMeaning: jest.fn(),
      sequenceMatch: null,
      setSequenceMatch: jest.fn(),
      currentLandmarks: [],
      setCurrentLandmarks: jest.fn(),
      currentHandedness: [],
      setCurrentHandedness: jest.fn(),
    };
  };

  return {
    ...actual,
    useRecognitionState,
    __setMockLastRecognizedGesture: (gesture: any) => {
      setLastRecognizedGestureMock?.(gesture ?? recognizedGestureTemplate);
    },
  };
});

const RecognitionScreen = require('../../src/screens/RecognitionScreen')
  .default as typeof import('../../src/screens/RecognitionScreen').default;
const localCentroids = require('../../src/services/localCentroids') as typeof import('../../src/services/localCentroids');
const recognitionStateModule = require('../../src/hooks/useRecognitionState') as {
  __setMockLastRecognizedGesture?: (gesture: any) => void;
};
const { AmyLoopTimeline } = require('../../src/components/AmyLoopTimeline');
const ActionButtonComponent = require('../../src/components/ActionButton').default;

describe('RecognitionScreen Amy-first overlay', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderRecognitionScreen = async () => {
    jest.spyOn(localCentroids, 'buildLocalCentroids').mockResolvedValue({});
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() }} />,
      );
    });

    return component;
  };

  it('renders the loop timeline and advances stages as gestures resolve', async () => {
    const component = await renderRecognitionScreen();
    const timeline = component.root.findByType(AmyLoopTimeline);
    expect(timeline.props.activeStage).toBe('see');

    await act(async () => {
      recognitionStateModule.__setMockLastRecognizedGesture?.({
        id: 'hallo',
        label: 'Hallo',
        emoji: '👋',
        category: 'greeting',
      });
    });

    const updatedTimeline = component.root.findByType(AmyLoopTimeline);
    expect(updatedTimeline.props.activeStage).toBe('confirm');
  });

  it('displays Amy-first action buttons for confirmation, learning, and alternatives', async () => {
    const component = await renderRecognitionScreen();
    const actionButtons = component.root.findAllByType(ActionButtonComponent);

    const labels = actionButtons.map((button) => button.props.label);
    expect(labels).toEqual(['Stimmt', 'Lernen', 'Alternativen']);

    const accessibilityLabels = actionButtons.map(
      (button) => button.props.accessibilityLabel,
    );
    expect(accessibilityLabels).toEqual([
      'Gestenerkennung bestätigen',
      'Lernmodus öffnen',
      'Alternativen anzeigen',
    ]);
  });
});
