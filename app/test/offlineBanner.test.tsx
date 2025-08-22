jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import OfflineBanner from '../src/components/OfflineBanner';
import { AccessibilityContext } from '../src/components/AccessibilityContext';
import { COLORS } from '../src/constants/ui';

describe('OfflineBanner', () => {
  const providerValue = { highContrast: false, largeText: false, update: () => {} };

  it('renders nothing when not visible', () => {
    const tree = renderer.create(<OfflineBanner visible={false} />).toJSON();
    expect(tree).toBeNull();
  });

  it('renders banner when visible', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={providerValue}>
          <OfflineBanner visible />
        </AccessibilityContext.Provider>,
      );
    });
    const text = (component as renderer.ReactTestRenderer).root.findByType('Text');
    expect(text.props.children).toBe('Offline mode');
  });

  it('applies high contrast styles', () => {
    const hcValue = { highContrast: true, largeText: true, update: () => {} };
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={hcValue}>
          <OfflineBanner visible />
        </AccessibilityContext.Provider>,
      );
    });
    const view = (component as renderer.ReactTestRenderer).root.findByType('View');
    const text = (component as renderer.ReactTestRenderer).root.findByType('Text');
    expect(view.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: COLORS.highContrastBackground })]),
    );
    expect(text.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: COLORS.highContrastText }),
        expect.objectContaining({ fontSize: 16 }),
      ]),
    );
  });
});

