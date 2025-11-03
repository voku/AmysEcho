import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { APP_TAB_ROUTES, LERNEN_STACK_ROUTES } from '../../src/navigation/types';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    useWindowDimensions: () => ({
      width: 1024,
      height: 768,
      scale: 2,
      fontScale: 2,
    }),
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
const mockGestureMeaningDisplay = jest.fn(() => null);
jest.mock('../../src/components/GestureMeaningDisplay', () => mockGestureMeaningDisplay);
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
  let mockStatus = 'Ich höre zu…';

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
      status: mockStatus,
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
    __setMockStatus: (status: string) => {
      mockStatus = status;
    },
    __resetMockStatus: () => {
      mockStatus = 'Ich höre zu…';
    },
  };
});

const RecognitionScreen = require('../../src/screens/RecognitionScreen')
  .default as typeof import('../../src/screens/RecognitionScreen').default;
const recognitionStateModule = require('../../src/hooks/useRecognitionState') as {
  __setMockLastRecognizedGesture?: (gesture: any) => void;
  __setMockStatus?: (status: string) => void;
  __resetMockStatus?: () => void;
};
const { AmyLoopTimeline } = require('../../src/components/AmyLoopTimeline');
const ActionButtonComponent = require('../../src/components/ActionButton').default;
const reactNative = require('react-native');
const { Text } = reactNative;

describe('RecognitionScreen Amy-first overlay', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockGestureMeaningDisplay.mockClear();
    recognitionStateModule.__resetMockStatus?.();
  });

  const renderRecognitionScreen = async (navigateMock: jest.Mock = jest.fn()) => {
    let component!: renderer.ReactTestRenderer;
    const navigation = { navigate: navigateMock };

    await act(async () => {
      component = renderer.create(<RecognitionScreen navigation={navigation} />);
    });

    return { component, navigation };
  };

  it('zeigt den reduzierten Kopfbereich ohne Timeline, aber mit Statuschip', async () => {
    const { component } = await renderRecognitionScreen();
    const timelines = component.root.findAllByType(AmyLoopTimeline);
    expect(timelines).toHaveLength(0);

    const statusLabelNodes = component.root.findAll(
      (node) => node.type === Text && node.props.children === 'Hört zu…',
    );
    expect(statusLabelNodes.length).toBeGreaterThan(0);

    const subtitleNodes = component.root.findAll(
      (node) => node.type === Text && node.props.children === 'Ich höre zu…',
    );
    expect(subtitleNodes.length).toBeGreaterThan(0);
  });

  it('rendert die Statuskarte auch ohne Statuswert', async () => {
    recognitionStateModule.__setMockStatus?.('');

    const { component } = await renderRecognitionScreen();

    expect(component).toBeTruthy();

    const fallbackDetailNodes = component.root.findAll(
      (node) =>
        node.type === Text && node.props.children === 'Halte deine Hand ruhig im Rahmen.',
    );

    expect(fallbackDetailNodes.length).toBeGreaterThan(0);

    const idleLabelNodes = component.root.findAll(
      (node) => node.type === Text && node.props.children === 'Bereit',
    );

    expect(idleLabelNodes.length).toBeGreaterThan(0);
  });

  it('öffnet das Handset-Aktionspanel automatisch bei aktiver Geste', async () => {
    jest
      .spyOn(reactNative, 'useWindowDimensions')
      .mockReturnValue({ width: 420, height: 720, scale: 2, fontScale: 2 });

    const { component } = await renderRecognitionScreen();

    const toggleButton = component.root.find((node) => node.props?.testID === 'handset-bottom-toggle');
    expect(toggleButton.props.accessibilityState?.expanded).toBe(false);

    await act(async () => {
      recognitionStateModule.__setMockLastRecognizedGesture?.({
        id: 'hallo',
        label: 'Hallo',
        emoji: '👋',
        category: 'greeting',
      });
    });

    const activeToggle = component.root.find((node) => node.props?.testID === 'handset-bottom-toggle');
    expect(activeToggle.props.accessibilityState?.expanded).toBe(true);

    const actionsContainer = component.root.find((node) => node.props?.testID === 'recognition-actions');
    expect(actionsContainer.props.pointerEvents).toBe('auto');
  });

  it('blendet Aktionsknöpfe erst nach erkannter Geste ein', async () => {
    const { component } = await renderRecognitionScreen();
    const findAmyActionButtons = () =>
      component.root
        .findAllByType(ActionButtonComponent)
        .filter((button) => ['Stimmt', 'Lernen', 'Alternativen'].includes(button.props.label));
    const getActionsContainer = () =>
      component.root.find((node) => node.props?.testID === 'recognition-actions');

    const initialActionsContainer = getActionsContainer();
    expect(initialActionsContainer.props.pointerEvents).toBe('none');
    expect(initialActionsContainer.props.accessibilityElementsHidden).toBe(false);
    expect(initialActionsContainer.props.importantForAccessibility).toBe('auto');

    const placeholderTexts = component.root.findAll(
      (node) => node.type === Text && node.props.children === 'Aktionen erscheinen hier.',
    );
    expect(placeholderTexts.length).toBeGreaterThan(0);

    expect(findAmyActionButtons()).toHaveLength(0);

    await act(async () => {
      recognitionStateModule.__setMockLastRecognizedGesture?.({
        id: 'hallo',
        label: 'Hallo',
        emoji: '👋',
        category: 'greeting',
      });
    });

    const activeActionsContainer = getActionsContainer();
    expect(activeActionsContainer.props.pointerEvents).toBe('auto');
    expect(activeActionsContainer.props.accessibilityElementsHidden).toBe(false);
    expect(activeActionsContainer.props.importantForAccessibility).toBe('auto');

    const remainingPlaceholders = component.root.findAll(
      (node) => node.type === Text && node.props.children === 'Aktionen erscheinen hier.',
    );
    expect(remainingPlaceholders).toHaveLength(0);

    const actionButtons = findAmyActionButtons();

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

    expect(actionButtons[0].props.backgroundColor).toBe('#E5E0CF');
    expect(actionButtons[0].props.textColor).toBe('#002C2C');
    expect(actionButtons[1].props.backgroundColor).toBe('#25706F');
    expect(actionButtons[1].props.textColor).toBe('#E5E0CF');
    expect(actionButtons[2].props.backgroundColor).toBe('#1C4A4B');
    expect(actionButtons[2].props.textColor).toBe('#E5E0CF');
  });

  it('öffnet bei erkannter Geste direkt die Aufnahme im Lernmodus', async () => {
    const navigateMock = jest.fn();
    const { component } = await renderRecognitionScreen(navigateMock);

    await act(async () => {
      recognitionStateModule.__setMockLastRecognizedGesture?.({
        id: 'hallo',
        label: 'Hallo',
        emoji: '👋',
        category: 'greeting',
      });
    });

    const learnButton = component.root
      .findAllByType(ActionButtonComponent)
      .find((button) => button.props.label === 'Lernen');

    expect(learnButton).toBeDefined();

    act(() => {
      learnButton?.props.onPress();
    });

    expect(navigateMock).toHaveBeenCalledWith(APP_TAB_ROUTES.Lernen, {
      screen: LERNEN_STACK_ROUTES.Recording,
      params: { gestureId: 'hallo' },
    });
  });

  it('zeigt die neue Kamerakarten-Tonart für Bedeutungsanzeigen', async () => {
    const { component } = await renderRecognitionScreen();
    expect(component).toBeTruthy();

    mockGestureMeaningDisplay.mockClear();

    await act(async () => {
      recognitionStateModule.__setMockLastRecognizedGesture?.({
        id: 'hallo',
        label: 'Hallo',
        emoji: '👋',
        category: 'greeting',
      });
    });

    expect(mockGestureMeaningDisplay).toHaveBeenCalled();
    const lastCall =
      mockGestureMeaningDisplay.mock.calls[mockGestureMeaningDisplay.mock.calls.length - 1];
    const lastCallProps = lastCall?.[0];
    expect(lastCallProps?.tone).toBe('camera');
    expect(lastCallProps?.detailsStartCollapsed).toBe(true);

    const encouragementNodes = component.root.findAll(
      (node) =>
        node.type === Text &&
        node.props.children === 'Tolle Geste – gleich klingt deine Stimme.',
    );
    expect(encouragementNodes.length).toBeGreaterThan(0);

    const statusChipNodes = component.root.findAll(
      (node) => node.type === Text && node.props.children === 'Selbstentdeckung',
    );
    expect(statusChipNodes.length).toBeGreaterThan(0);

  });
});
