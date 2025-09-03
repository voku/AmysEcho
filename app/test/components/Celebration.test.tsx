import React from 'react';
import { render } from '@testing-library/react-native';
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

jest.mock('../../src/services/LanguageManager', () => ({
  LanguageManager: { t: (k: string) => (k === 'celebration.label' ? 'Gut gemacht!' : k) },
}));

describe('Celebration', () => {
  it('renders with German accessibility label', () => {
    const { toJSON } = render(<Celebration />);
    const view = toJSON() as any;
    expect(view.props.accessibilityLabel).toBe('Gut gemacht!');
    expect(view.props.accessibilityRole).toBe('alert');
    expect(view.children?.[0].children).toContain('🎉');
  });
});
