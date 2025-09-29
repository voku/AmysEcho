import React from 'react';
import renderer, { act } from 'react-test-renderer';

import PracticeScreen from '../../src/screens/PracticeScreen';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));
jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/storage', () => ({ loadProfile: () => Promise.resolve({ id: 'p1' }) }));
jest.mock('../../src/model', () => ({ gestureModel: { gestures: [{ id: 'hello', label: 'Hallo' }] } }));

describe('PracticeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to Training when practice button pressed', async () => {
    const navigate = jest.fn();
    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PracticeScreen navigation={{ navigate }} />);
    });
    act(() => {
      component.root.findByProps({ testID: 'practice-hello' }).props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('Training', { gestureLabel: 'hello', isPractice: true });
  });

  it('practice button exposes accessibility label', async () => {
    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PracticeScreen navigation={{ navigate: jest.fn() }} />);
    });
    const btn = component.root.findByProps({ testID: 'practice-hello' });
    expect(btn.props.accessibilityLabel).toBe('Übe Hallo');
  });
});
