import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (p: any) => React.createElement('View', p, p.children),
    Text: (p: any) => React.createElement('Text', p, p.children),
    TextInput: (p: any) => React.createElement('TextInput', p, p.children),
    Pressable: (p: any) => React.createElement('Pressable', p, p.children),
    ScrollView: (p: any) => React.createElement('ScrollView', p, p.children),
    StyleSheet: {
      create: (s: any) => s,
      flatten: (style: any) => style,
    },
  } as any;
});

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false, highContrast: false }),
}));

jest.mock('../../src/services/feedbackService', () => ({
  childHaptic: jest.fn(),
}));

import ParentalGateScreen from '../../src/screens/ParentalGateScreen';

describe('ParentalGateScreen interactions', () => {
  const targetRoute = 'Parent';

  beforeEach(() => {
    jest.spyOn(global.Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('replaces the current screen with the target when the answer is correct', async () => {
    const replace = jest.fn();
    const navigation = { replace, goBack: jest.fn() };

    let component!: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <ParentalGateScreen navigation={navigation as any} route={{ params: { target: targetRoute } }} />,
      );
      await Promise.resolve();
    });

    const input = component.root.findByProps({ accessibilityLabel: 'Antwort auf Elternprüfung' });
    act(() => {
      input.props.onChangeText('4');
    });

    act(() => {
      component.root.findByProps({ accessibilityLabel: 'Antwort bestätigen' }).props.onPress();
    });

    expect(replace).toHaveBeenCalledWith(targetRoute);
  });
});
