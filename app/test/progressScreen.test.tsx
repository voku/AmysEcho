import React from 'react';
import renderer, { act } from 'react-test-renderer';

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
  Paths: {
    document: { uri: 'file://docs' },
    cache: { uri: 'file://cache' },
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  Paths: {
    document: { uri: 'file://docs' },
    cache: { uri: 'file://cache' },
  },
}));
jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../src/context/ThemeContext', () => {
  const themes = jest.requireActual('../src/constants/themes');
  const theme = themes.THEMES[themes.DEFAULT_THEME];

  return {
    useTheme: () => ({
      theme,
      themeName: themes.DEFAULT_THEME,
      setTheme: jest.fn(),
      availableThemes: themes.THEMES,
    }),
  };
});

// Mock BottomNav to avoid requiring a NavigationContainer context in unit test
jest.mock('../src/components/BottomNav', () => () => null);

import ProgressScreen from '../src/screens/ProgressScreen';
import { loadProfile } from '../src/storage';
import { loadUsageStats } from '../src/services/usageTracker';
import { loadEngagementStats } from '../src/services/engagementTracker';

describe('ProgressScreen', () => {
  beforeEach(() => {
    (loadProfile as jest.Mock).mockResolvedValue({
      id: 'p1',
      name: 'Test',
      consentDataUpload: true,
      consentHelpMeGetSmarter: true,
      vocabularySetId: 'basic',
    });
    (loadUsageStats as jest.Mock).mockResolvedValue({ hello: 3 });
    (loadEngagementStats as jest.Mock).mockResolvedValue({
      totalSessions: 2,
      totalDurationMs: 10000,
      averageDurationMs: 5000,
    });
  });

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
