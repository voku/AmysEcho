import React from 'react';
import renderer, { act } from 'react-test-renderer';
import Celebration from '../../src/components/Celebration';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    Animated: {
      Value: class { constructor(public v: any) {} setValue(_: any) {} },
      timing: () => ({ start: jest.fn(), stop: jest.fn() }),
      delay: () => ({ start: jest.fn(), stop: jest.fn() }),
      sequence: () => ({ start: jest.fn(), stop: jest.fn() }),
      View: (p: any) => React.createElement('Animated.View', p, p.children),
    },
    StyleSheet: { create: (s: any) => s },
    Text: (p: any) => React.createElement('Text', p, p.children),
  } as any;
});

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false }),
}));

describe('Celebration', () => {
  it('renders with German accessibility label when visible', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<Celebration visible={true} />);
    });
    const view = component.root.findByType('Animated.View');
    expect(view.props.accessibilityLabel).toBe('Gut gemacht!');
    const text = component.root.findByType('Text');
    expect(text.props.children).toBe('🎉');
  });
});
