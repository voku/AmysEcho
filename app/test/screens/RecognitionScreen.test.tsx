import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  const noop = () => null;
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    Button: (props: any) => React.createElement('Button', props, props.children),
    SafeAreaView: (props: any) => React.createElement('SafeAreaView', props, props.children),
    StyleSheet: { create: (s: any) => s },
    Animated: { Value: class { constructor(public v: any) {} }, timing: noop, spring: noop },
    Easing: {},
  } as any;
});

import RecognitionScreen from '../../src/screens/RecognitionScreen';

jest.mock('../../src/components/MediaPipeGestureDetector', () => ({
  MediaPipeGestureDetector: () => null,
}));
jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false }),
}));
jest.mock('../../src/services', () => ({
  audioService: { speak: jest.fn(), playEncouragement: jest.fn(), playSuccessFeedback: jest.fn() },
  triggerSpeakAndShow: jest.fn(),
  correctionService: { logCorrection: jest.fn() },
  dialogEngine: { getLLMSuggestions: jest.fn() },
}));
jest.mock('../../src/telemetry/recorder', () => ({
  telemetry: { add: jest.fn() },
}));
jest.mock('../../src/storage', () => ({
  loadProfile: () => Promise.resolve(null),
  logCorrection: jest.fn(),
}));
jest.mock('../../src/model', () => ({
  gestureModel: { gestures: [] },
}));
jest.mock('../../src/services/HybridRecognizer', () => ({
  useHybridFrameProcessor: () => undefined,
}));

describe('RecognitionScreen', () => {
  it('navigates to Correction screen when correction button is pressed', async () => {
    const navigate = jest.fn();
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<RecognitionScreen navigation={{ navigate }} />);
    });
    const button = component!.root.findByProps({ testID: 'btn-correction' });
    await act(async () => {
      button.props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('Correction');
  });

  it('exposes correction button accessibility label', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<RecognitionScreen navigation={{ navigate: jest.fn() }} />);
    });
    const button = component!.root.findByProps({ testID: 'btn-correction' });
    expect(button.props.accessibilityLabel).toBe('Open correction screen');
  });
});
