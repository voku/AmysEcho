import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    Button: (p: any) => React.createElement('Button', p, p.children),
    SafeAreaView: (p: any) => React.createElement('SafeAreaView', p, p.children),
    Pressable: (p: any) => React.createElement('Pressable', p, p.children),
    StyleSheet: {
      create: (s: any) => s,
      flatten: (style: any) => style,
    },
    ScrollView: (p: any) => React.createElement('ScrollView', p, p.children),
  } as any;
});

import TeachScreen from '../../src/screens/TeachScreen';

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(),
  createAudioPlayer: jest.fn(() => ({
    volume: 1,
    loop: false,
    seekTo: jest.fn(),
    play: jest.fn(),
    remove: jest.fn(),
  })),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  Paths: {
    document: { uri: 'file:///docs/' },
    cache: { uri: 'file:///cache/' },
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  Paths: {
    document: { uri: 'file:///docs/' },
    cache: { uri: 'file:///cache/' },
  },
}));
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

describe('TeachScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('add sign button navigates to Teaching screen', () => {
    const navigate = jest.fn();
    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<TeachScreen navigation={{ navigate }} />);
    });
    act(() => {
      component.root.findByProps({ testID: 'btn-add-sign' }).props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('Teaching');
  });

  it('button exposes accessibility label', () => {
    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<TeachScreen navigation={{ navigate: jest.fn() }} />);
    });
    const btn = component.root.findByProps({ testID: 'btn-add-sign' });
    expect(btn.props.accessibilityLabel).toBe('Neue Gebärde hinzufügen');
  });
});
