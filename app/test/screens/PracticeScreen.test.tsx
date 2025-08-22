import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    Button: (p: any) => React.createElement('Button', p, p.children),
    FlatList: ({ data, renderItem, ListEmptyComponent }: any) =>
      React.createElement(
        'FlatList',
        null,
        data && data.length ? data.map((item: any, index: number) => renderItem({ item, index })) : ListEmptyComponent || null,
      ),
    SafeAreaView: (p: any) => React.createElement('SafeAreaView', p, p.children),
    Animated: {
      Value: class { constructor(public v: any) {} },
      timing: () => ({ start: jest.fn() }),
      View: (p: any) => React.createElement('Animated.View', p, p.children),
    },
    StyleSheet: { create: (s: any) => s },
  } as any;
});

import PracticeScreen from '../../src/screens/PracticeScreen';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));
jest.mock('../../src/components/BottomNav', () => () => null);
jest.mock('../../src/storage', () => ({ loadProfile: () => Promise.resolve({ id: 'p1' }) }));
jest.mock('../../src/model', () => ({ gestureModel: { gestures: [{ id: 'hello', label: 'Hallo' }] } }));

describe('PracticeScreen', () => {
  it('navigates to Training when practice button pressed', async () => {
    const navigate = jest.fn();
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PracticeScreen navigation={{ navigate }} />);
    });
    await act(async () => {
      component.root.findByProps({ testID: 'practice-hello' }).props.onPress();
    });
    expect(navigate).toHaveBeenCalledWith('Training', { gestureLabel: 'hello', isPractice: true });
  });

  it('practice button exposes accessibility label', async () => {
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(<PracticeScreen navigation={{ navigate: jest.fn() }} />);
    });
    const btn = component.root.findByProps({ testID: 'practice-hello' });
    expect(btn.props.accessibilityLabel).toBe('Übe Hallo');
  });
});
