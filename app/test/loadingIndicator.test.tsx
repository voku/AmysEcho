import React from 'react';
import renderer, { act } from 'react-test-renderer';
import LoadingIndicator from '../src/components/LoadingIndicator';
import { AccessibilityContext } from '../src/components/AccessibilityContext';
import { COLORS } from '../src/constants/ui';

describe('LoadingIndicator', () => {
  const value = { highContrast: false, largeText: false, update: () => {} };

  it('renders loading text and spinner', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={value}>
          <LoadingIndicator />
        </AccessibilityContext.Provider>,
      );
    });
    const text = (component as renderer.ReactTestRenderer).root.findByType('Text');
    const spinner = (component as renderer.ReactTestRenderer).root.findByType('ActivityIndicator');
    expect(text.props.children).toBe('Wird geladen...');
    expect(spinner.props.accessibilityRole).toBe('progressbar');
  });

  it('applies high contrast and large text styles', () => {
    const hc = { highContrast: true, largeText: true, update: () => {} };
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={hc}>
          <LoadingIndicator />
        </AccessibilityContext.Provider>,
      );
    });
    const text = (component as renderer.ReactTestRenderer).root.findByType('Text');
    const spinner = (component as renderer.ReactTestRenderer).root.findByType('ActivityIndicator');
    expect(text.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: COLORS.highContrastText }),
        expect.objectContaining({ fontSize: 18 }),
      ]),
    );
    expect(spinner.props.color).toBe(COLORS.highContrastText);
  });

  it('renders a custom label', () => {
    const customLabel = 'Daten werden geladen...';
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={value}>
          <LoadingIndicator label={customLabel} />
        </AccessibilityContext.Provider>,
      );
    });
    const text = (component as renderer.ReactTestRenderer).root.findByType('Text');
    expect(text.props.children).toBe(customLabel);
  });

  it('is fullscreen by default', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={value}>
          <LoadingIndicator />
        </AccessibilityContext.Provider>,
      );
    });
    const view = (component as renderer.ReactTestRenderer).root.findByType('View');
    expect(view.props.style).toEqual(expect.arrayContaining([{ flex: 1 }]));
  });

  it('is not fullscreen when specified', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={value}>
          <LoadingIndicator fullscreen={false} />
        </AccessibilityContext.Provider>,
      );
    });
    const view = (component as renderer.ReactTestRenderer).root.findByType('View');
    expect(view.props.style).not.toContainEqual({ flex: 1 });
  });
});
