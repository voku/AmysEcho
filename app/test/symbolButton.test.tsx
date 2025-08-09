import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: (props: any) => React.createElement('Pressable', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

const childHaptic = jest.fn();

jest.mock('../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

import { SymbolButton } from '../src/components/SymbolButton';
import { COLORS } from '../src/constants/ui';

describe('SymbolButton', () => {
  it('triggers haptic feedback on press', () => {
    const symbol: any = { id: '1', name: 'Hello', emoji: '👋' };
    const onPress = jest.fn();
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <SymbolButton symbol={symbol} onPress={onPress} />,
      );
    });
    const pressable = (component as renderer.ReactTestRenderer).root.findByType('Pressable');
    const { childHaptic: mockHaptic } = require('../src/services/feedbackService');
    act(() => {
      pressable.props.onPress();
    });
    expect(mockHaptic).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledWith(symbol);
  });

  it('applies pressed visual style', () => {
    const symbol: any = { id: '1', name: 'Hello', emoji: '👋' };
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <SymbolButton symbol={symbol} onPress={() => {}} />,
      );
    });
    const pressable = (component as renderer.ReactTestRenderer).root.findByType('Pressable');
    const styleFn = pressable.props.style as (args: { pressed: boolean }) => any;
    const pressedStyle = styleFn({ pressed: true });
    expect(pressedStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: COLORS.pressed })]),
    );
  });
});
