import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));
jest.mock('../../src/components/BottomNav', () => () => null);
const mockReact = require('react');
jest.mock('../../src/components/MediaPipeGestureDetector', () => ({
  MediaPipeGestureDetector: (props: any) => mockReact.createElement('MediaPipeGestureDetector', props, null),
}));
jest.mock('../../src/storage', () => ({
  __esModule: true,
  loadProfile: () => Promise.resolve({ id: 'p1', name: 'Test Profile' }),
}));

// Mock setInterval and clearInterval
jest.spyOn(global, 'setInterval').mockImplementation(() => 1 as any);
jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
jest.mock('../../src/context/MessageContext', () => ({
  useMessage: () => ({ setMessage: jest.fn() }),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));

import GesturePracticeScreen from '../../src/screens/GesturePracticeScreen';

describe('GesturePracticeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    let component: any;
    act(() => {
      component = renderer.create(<GesturePracticeScreen />);
    });
    const titleText = component.root.findAllByType('Text').find(t => t.props.children === 'Gesten üben');
    expect(titleText).toBeTruthy();
  });

  it('shows practice instruction', () => {
    let component: any;
    act(() => {
      component = renderer.create(<GesturePracticeScreen />);
    });
    const texts = component.root.findAllByType('Text');
    expect(texts.some(t => t.props.children.includes('Halte deine Hand'))).toBe(true);
  });
});
