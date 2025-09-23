import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    Pressable: (props: any) => React.createElement('Pressable', props, props.children),
    Button: (props: any) => React.createElement('Button', props, props.children),
    FlatList: ({ data, renderItem, ListEmptyComponent, keyExtractor }: any) =>
      React.createElement(
        'FlatList',
        null,
        data && data.length
          ? data.map((item: any, index: number) => {
              const element = renderItem({ item, index });
              const key = keyExtractor ? keyExtractor(item) : index;
              return React.cloneElement(element, { key });
            })
          : ListEmptyComponent || null,
      ),
    StyleSheet: { create: () => ({}) },
    Touchable: {
      Mixin: {},
    },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    Svg: (props: any) => React.createElement('Svg', props, props.children),
    Path: (props: any) => React.createElement('Path', props),
    Circle: (props: any) => React.createElement('Circle', props),
    Rect: (props: any) => React.createElement('Rect', props),
  };
});

jest.mock('../src/services/usageTracker', () => ({
  loadUsageStats: jest.fn(() => Promise.resolve({ hello: 3 })),
}));

jest.mock('../src/services/engagementTracker', () => ({
  loadEngagementStats: jest.fn(() =>
    Promise.resolve({ totalSessions: 2, totalDurationMs: 10000, averageDurationMs: 5000 }),
  ),
}));

jest.mock('../src/storage', () => ({
  loadProfile: jest.fn(() =>
    Promise.resolve({
      id: 'p1',
      name: 'Test',
      consentDataUpload: true,
      consentHelpMeGetSmarter: true,
      vocabularySetId: 'basic',
    }),
  ),
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
}));
jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

// Mock BottomNav to avoid requiring a NavigationContainer context in unit test
jest.mock('../src/components/BottomNav', () => () => null);

import ProgressScreen from '../src/screens/ProgressScreen';

describe.skip('ProgressScreen', () => {
  it('renders usage statistics', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<ProgressScreen navigation={{ goBack: jest.fn() }} />);
    });
    const textNodes = (component as renderer.ReactTestRenderer).root.findAll((node) => node.type === 'Text');
    const contents = textNodes.map((n) => n.props.children);
    expect(contents).toContain('👋 Hallo');
    expect(contents).toContain(3);
    expect(contents).toContain(2);
    expect(contents).toContain(5);
  });
});
