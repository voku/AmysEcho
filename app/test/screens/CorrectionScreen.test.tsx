import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    Pressable: (p: any) => React.createElement('Pressable', p, p.children),
    SafeAreaView: (p: any) => React.createElement('SafeAreaView', p, p.children),
    ScrollView: (p: any) => React.createElement('ScrollView', p, p.children),
    StyleSheet: {
      create: (s: any) => s,
      flatten: (style: any) => style,
    },
  } as any;
});

jest.mock('../../src/storage', () => ({ logCorrection: jest.fn() }));
import { logCorrection } from '../../src/storage';

jest.mock('../../src/services/correctionService', () => ({ correctionService: { logCorrection: jest.fn() } }));
import { correctionService } from '../../src/services/correctionService';

import CorrectionScreen from '../../src/screens/CorrectionScreen';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(() => ({ granted: true })),
  createAudioPlayer: jest.fn(() => ({
    volume: 1,
    loop: false,
    seekTo: jest.fn(),
    play: jest.fn(),
    remove: jest.fn(),
  })),
  AudioRecorder: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));
jest.mock('expo-file-system', () => ({
  bundleDirectory: 'bundle/',
  documentDirectory: 'docs/',
  getInfoAsync: jest.fn(() => ({ exists: true })),
  Paths: {
    document: { uri: 'file://docs/' },
    cache: { uri: 'file://cache/' },
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  Paths: {
    document: { uri: 'file://docs/' },
    cache: { uri: 'file://cache/' },
  },
}));
jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    Svg: (props: any) => React.createElement('Svg', props, props.children),
    Path: (props: any) => React.createElement('Path', props),
    Circle: (props: any) => React.createElement('Circle', props),
  };
});
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));
jest.mock('../../src/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: { colors: { gradientStart: '#000000', gradientEnd: '#111111' } },
    themeName: 'default',
    setTheme: jest.fn(),
    availableThemes: {},
  }),
}));
jest.mock('../../src/components/PulsingCircle', () => () => null);

describe('CorrectionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submit logs correction and goes back', async () => {
    const goBack = jest.fn();
    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<CorrectionScreen navigation={{ goBack }} />);
    });
    await act(async () => {
      component.root.findByProps({ testID: 'btn-submit-correction' }).props.onPress();
    });
    expect(correctionService.logCorrection).toHaveBeenCalledWith('correction');
    expect(logCorrection).toHaveBeenCalledWith('correction');
    expect(goBack).toHaveBeenCalled();
  });

  it('cancel goes back without logging', async () => {
    const goBack = jest.fn();
    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<CorrectionScreen navigation={{ goBack }} />);
    });
    act(() => {
      component.root.findByProps({ testID: 'btn-cancel-correction' }).props.onPress();
    });
    expect(goBack).toHaveBeenCalled();
    expect(correctionService.logCorrection).not.toHaveBeenCalled();
    expect(logCorrection).not.toHaveBeenCalled();
  });
});
