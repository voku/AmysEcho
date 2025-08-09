import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Pressable: (props: any) => React.createElement('Pressable', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    StyleSheet: { create: () => ({}) },
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
});
