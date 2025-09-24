import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  const createElement = (name: string) => (props: any) => React.createElement(name, props, props.children);

  return {
    View: createElement('View'),
    Text: createElement('Text'),
    Pressable: createElement('Pressable'),
    StyleSheet: { create: (styles: any) => styles, absoluteFill: { position: 'absolute' } },
    SafeAreaView: createElement('SafeAreaView'),
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  } as any;
});

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ setMessage: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

jest.mock('../../src/services/dgsTrainingService', () => ({
  sendDgsSample: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/TrainingDataValidator', () => ({
  validateLandmarkSequence: () => ({ ok: true, suggestions: [] }),
}));

jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/components/DgsVideoPlayer', () => () => null);
jest.mock('../../src/components/PerformanceAnalytics', () => () => null);
jest.mock('../../src/components/PracticeSessionManager', () => () => null);

jest.mock('../../src/services', () => ({
  audioService: {
    playEncouragement: jest.fn(),
    playCelebrationFeedback: jest.fn(),
  },
}));

jest.mock('../../src/services/hipEvents', () => ({
  logHIPEvent: jest.fn(),
}));

jest.mock('../../src/services/positiveTelemetryService', () => ({
  positiveTelemetryService: { recordSuccess: jest.fn() },
}));

jest.mock('../../src/styles/touchTargets', () => ({
  childFriendlyStyles: { minTouchTarget: { minWidth: 60, minHeight: 60 } },
}));

jest.mock('../../src/utils/hapticUtils', () => ({
  hapticFeedback: { light: jest.fn() },
}));

jest.mock('../../src/model', () => ({
  gestureModel: { gestures: [{ id: 'hello', label: 'Hallo' }] },
}));

jest.mock('../../src/storage', () => ({
  saveTrainingSample: jest.fn(() => Promise.resolve()),
  loadProfile: jest.fn(() => Promise.resolve(null)),
  loadActiveProfileId: jest.fn(() => Promise.resolve(null)),
  onActiveProfileChange: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => React.createElement('Svg', props, props.children),
    Circle: (props: any) => React.createElement('Circle', props),
  };
});

jest.mock('../../src/components/MediaPipeGestureDetector', () => {
  const React = require('react');
  return {
    MediaPipeGestureDetector: (props: any) =>
      React.createElement('MediaPipeGestureDetector', props, props.children),
  };
});

import TrainingScreen from '../../src/screens/TrainingScreen';

describe('TrainingScreen', () => {
  let component: renderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (component) {
      act(() => component!.unmount());
      component = null;
    }
  });

  it('records landmarks via MediaPipe gesture detector', async () => {
    const { saveTrainingSample, loadProfile } = require('../../src/storage');
    (loadProfile as jest.Mock).mockResolvedValue(null);
    (saveTrainingSample as jest.Mock).mockResolvedValue(undefined);
    await act(async () => {
      component = renderer.create(
        <TrainingScreen navigation={{ goBack: jest.fn() }} route={{ params: { gestureLabel: 'hello' } }} /> as any,
      );
      await Promise.resolve();
    });

    expect(component).not.toBeNull();

    const recordPressable = component!
      .root
      .findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Gestenaufnahme starten')[0];

    act(() => {
      recordPressable.props.onPress();
    });

    const detector = component!.root.findByType('MediaPipeGestureDetector');
    act(() => {
      detector.props.onGestureDetected(null, 0.9, [[[1, 2, 3]]], ['Left']);
    });

    await act(async () => {
      recordPressable.props.onPress();
      await Promise.resolve();
    });

    expect(saveTrainingSample).toHaveBeenCalledWith(
      'hello',
      [{ landmarks: [[[1, 2, 3]]], handedness: ['Left'] }],
      'HIP_2',
    );

    const { sendDgsSample } = require('../../src/services/dgsTrainingService');
    expect(sendDgsSample).toHaveBeenCalledWith(
      'hello',
      { landmarks: [[[1, 2, 3]]], handedness: ['Left'] },
      undefined,
    );
  });
});
