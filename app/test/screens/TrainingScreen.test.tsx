import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    Button: (p: any) => React.createElement('Button', p, p.children),
    StyleSheet: { create: (s: any) => s },
    SafeAreaView: (p: any) => React.createElement('SafeAreaView', p, p.children),
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

jest.mock('../../src/services', () => ({
  audioService: { playEncouragement: jest.fn() },
}));

jest.mock('../../src/services/hipEvents', () => ({
  logHIPEvent: jest.fn(),
}));

jest.mock('../../src/model', () => ({
  gestureModel: { gestures: [{ id: 'hello', label: 'Hallo' }] },
}));

jest.mock('../../src/storage', () => ({
  saveTrainingSample: jest.fn(async () => {}),
  loadProfile: jest.fn(async () => null),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/components/MediaPipeGestureDetector', () => {
  const React = require('react');
  return {
    MediaPipeGestureDetector: (props: any) => React.createElement('MediaPipeGestureDetector', props, null),
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (p: any) => React.createElement('Svg', p, p.children),
    Circle: (p: any) => React.createElement('Circle', p),
  };
});

import TrainingScreen from '../../src/screens/TrainingScreen';

describe.skip('TrainingScreen', () => {
  let component: renderer.ReactTestRenderer | null = null;

  afterEach(() => {
    if (component) {
      act(() => component!.unmount());
      component = null;
    }
  });

  it('records landmarks via MediaPipe gesture detector', async () => {
    const { saveTrainingSample } = require('../../src/storage');
    await act(async () => {
      component = renderer.create(
        <TrainingScreen navigation={{ goBack: jest.fn() }} route={{ params: { gestureLabel: 'hello' } }} /> as any,
      );
      await Promise.resolve();
    });
    expect(component).not.toBeNull();
    const button = component!.root.findByType('Button');
    act(() => {
      button.props.onPress();
    });
    const detector = component!.root.findByType('MediaPipeGestureDetector');
    act(() => {
      detector.props.onGestureDetected(null, 0.9, [[[1, 2, 3]]], ['Left']);
    });
    await act(async () => {
      button.props.onPress();
      await Promise.resolve();
    });
    expect(saveTrainingSample).toHaveBeenCalledWith('hello', [{ landmarks: [[[1, 2, 3]]], handedness: ['Left'] }], 'HIP_2');
    const { sendDgsSample } = require('../../src/services/dgsTrainingService');
    expect(sendDgsSample).toHaveBeenCalledWith(
      'hello',
      { landmarks: [[[1, 2, 3]]], handedness: ['Left'] },
      undefined,
    );
  });
});

