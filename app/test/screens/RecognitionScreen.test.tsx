import React from 'react';
import renderer, { act } from 'react-test-renderer';

const SETTINGS_TOGGLE_LABEL = 'Einstellungen anzeigen/verstecken';
const TOGGLE_DGS_VIDEO_LABEL = 'DGS-Video umschalten';
const HIDE_DGS_VIDEO_LABEL = 'DGS-Video ausblenden';

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
  useMessage: () => ({ setMessage: jest.fn() }),
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

jest.mock('../../src/components/DgsVideoPlayer', () => {
  const React = require('react');
  return function MockDgsVideoPlayer(props: any) {
    return React.createElement('DgsVideoPlayer', props, null);
  };
});

jest.mock('../../src/services/performanceOptimizationService', () => ({
  performanceOptimizationService: {
    updateMetrics: jest.fn(),
    cleanup: jest.fn(),
  },
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

  const initialGesture = {
    id: 'hallo',
    label: 'Hallo',
    emoji: '👋',
    category: 'greeting',
    dgsVideoUri: 'dgs/hallo.mp4',
  };

  const useRecognitionState = () => {
    const [showDgsVideo, setShowDgsVideo] = React.useState(false);
    const [lastRecognizedGesture, setLastRecognizedGesture] =
      React.useState(initialGesture);

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
      showDgsVideo,
      setShowDgsVideo,
      showCelebration: false,
      setShowCelebration: jest.fn(),
      celebrationKey: 0,
      setCelebrationKey: jest.fn(),
      screenReaderEnabled: false,
      setScreenReaderEnabled: jest.fn(),
      modelUpdateStatus: 'idle',
      setModelUpdateStatus: jest.fn(),
      bullyingProtectionActive: false,
      setBullyingProtectionActive: jest.fn(),
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
      setLastRecognizedGestureMock?.(gesture);
    },
  };
});

const RecognitionScreen = require('../../src/screens/RecognitionScreen')
  .default as typeof import('../../src/screens/RecognitionScreen').default;
const localCentroids = require('../../src/services/localCentroids') as typeof import('../../src/services/localCentroids');
const recognitionStateModule = require('../../src/hooks/useRecognitionState') as {
  __setMockLastRecognizedGesture?: (gesture: any) => void;
};

describe('RecognitionScreen DGS video toggle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('toggles the DGS video overlay when pressed', async () => {
    jest.spyOn(localCentroids, 'buildLocalCentroids').mockResolvedValue({});
    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() }} />,
      );
    });

    act(() => {
      const settingsButton = component.root.findByProps({
        accessibilityLabel: SETTINGS_TOGGLE_LABEL,
      });
      settingsButton.props.onPress();
    });

    const findToggleButton = () =>
      component.root.findByProps({ accessibilityLabel: TOGGLE_DGS_VIDEO_LABEL });
    const findVideoPlayer = () => component.root.findAllByType('DgsVideoPlayer');

    expect(findVideoPlayer()).toHaveLength(0);
    expect(findToggleButton().props.title).toBe('DGS-Video anzeigen');

    act(() => {
      findToggleButton().props.onPress();
    });

    expect(findVideoPlayer()).toHaveLength(1);
    expect(findToggleButton().props.title).toBe(HIDE_DGS_VIDEO_LABEL);

    act(() => {
      findToggleButton().props.onPress();
    });

    expect(findVideoPlayer()).toHaveLength(0);
    expect(findToggleButton().props.title).toBe('DGS-Video anzeigen');
  });

  it('hides the overlay when the next gesture lacks a DGS video', async () => {
    const setLastRecognizedGesture = recognitionStateModule.__setMockLastRecognizedGesture;
    expect(typeof setLastRecognizedGesture).toBe('function');

    jest.spyOn(localCentroids, 'buildLocalCentroids').mockResolvedValue({});

    let component!: renderer.ReactTestRenderer;

    await act(async () => {
      component = renderer.create(
        <RecognitionScreen navigation={{ navigate: jest.fn() }} />,
      );
    });

    act(() => {
      const settingsButton = component.root.findByProps({
        accessibilityLabel: SETTINGS_TOGGLE_LABEL,
      });
      settingsButton.props.onPress();
    });

    const findToggleButtons = () =>
      component.root.findAll(
        (node) =>
          node.props?.accessibilityLabel === TOGGLE_DGS_VIDEO_LABEL && node.type === 'Button',
      );
    const findVideoPlayer = () => component.root.findAllByType('DgsVideoPlayer');

    expect(findToggleButtons()).toHaveLength(1);

    act(() => {
      findToggleButtons()[0].props.onPress();
    });

    expect(findVideoPlayer()).toHaveLength(1);

    await act(async () => {
      setLastRecognizedGesture?.({
        id: 'bitte',
        label: 'Bitte',
        emoji: '🙏',
        category: 'manners',
      });
    });

    expect(findVideoPlayer()).toHaveLength(0);
    expect(findToggleButtons()).toHaveLength(0);
  });
});
