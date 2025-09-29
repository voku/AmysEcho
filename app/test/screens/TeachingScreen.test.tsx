import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
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
jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ setMessage: jest.fn() }),
}));
jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/services/audioService', () => ({
  audioService: { speak: jest.fn(), playSound: jest.fn() },
}));
jest.mock('../../src/storage', () => {
  const actual = jest.requireActual('../../src/storage');
  return {
    ...actual,
    loadProfile: jest.fn(async () => ({ id: '1', name: 'Amy' })),
    loadTrainingSampleCount: jest.fn(async () => 0),
    saveTrainingSample: jest.fn(async () => {}),
    saveCustomGesture: jest.fn(async () => {}),
  };
});
jest.mock('../../src/services/gestureRecorder', () => ({
  captureSamples: jest.fn(async () => []),
}));
jest.mock('../../src/services', () => ({
  syncTrainingData: jest.fn(async () => {}),
}));
jest.mock('../../src/components/MediaPipeGestureDetector', () => ({
  MediaPipeGestureDetector: () => null,
}));

import TeachingScreen from '../../src/screens/TeachingScreen';

describe('TeachingScreen', () => {
  it('renders German title', async () => {
    let component!: renderer.ReactTestRenderer;
    const storage = require('../../src/storage');
    const recorder = require('../../src/services/gestureRecorder');
    const services = require('../../src/services');
    (storage.loadProfile as jest.Mock).mockResolvedValue({ id: '1', name: 'Amy' });
    (storage.loadTrainingSampleCount as jest.Mock).mockResolvedValue(0);
    (storage.saveTrainingSample as jest.Mock).mockResolvedValue(undefined);
    (storage.saveCustomGesture as jest.Mock).mockResolvedValue(undefined);
    (recorder.captureSamples as jest.Mock).mockResolvedValue([]);
    (services.syncTrainingData as jest.Mock).mockResolvedValue(undefined);
    await act(async () => {
      component = renderer.create(<TeachingScreen navigation={{ goBack: jest.fn() }} />);
      await Promise.resolve();
    });
    const textNodes = component.root.findAllByType('Text');
    expect(textNodes.some((n) => n.props.children === 'Neue Geste beibringen')).toBe(true);
  });
});
