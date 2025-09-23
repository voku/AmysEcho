import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Button: (p: any) => React.createElement('Button', p, p.children),
    SafeAreaView: (p: any) => React.createElement('SafeAreaView', p, p.children),
    StyleSheet: { create: (s: any) => s },
  } as any;
});

import TeachScreen from '../../src/screens/TeachScreen';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children }));
jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

describe.skip('TeachScreen', () => {
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
