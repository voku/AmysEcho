jest.mock('../src/services/crashReporting', () => ({
  enqueueCrashReport: jest.fn(() => Promise.resolve()),
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import ChildErrorBoundary from '../src/components/ChildErrorBoundary';
import { AccessibilityContext } from '../src/components/AccessibilityContext';
import { enqueueCrashReport } from '../src/services/crashReporting';

const providerValue = { largeText: false, highContrast: false, update: () => {} };

describe('ChildErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('shows friendly message and reports error', () => {
    const Problem = () => {
      throw new Error('boom');
    };
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={providerValue}>
          <ChildErrorBoundary>
            <Problem />
          </ChildErrorBoundary>
        </AccessibilityContext.Provider>
      );
    });
    const text = (component as any).root.findByProps({ testID: 'error-text' });
    expect(String(text.props.children)).toContain('noch einmal versuchen');
    expect(enqueueCrashReport).toHaveBeenCalled();
    (component as renderer.ReactTestRenderer).unmount();
  });

  it('recovers after retry', () => {
    let shouldThrow = true;
    const Switcher = () => {
      if (shouldThrow) throw new Error('fail');
      return <Text testID="ok">hi</Text>;
    };
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <AccessibilityContext.Provider value={providerValue}>
          <ChildErrorBoundary>
            <Switcher />
          </ChildErrorBoundary>
        </AccessibilityContext.Provider>
      );
    });
    act(() => {
      shouldThrow = false;
      const btn = (component as any).root.findByProps({ testID: 'retry-button' });
      btn.props.onPress();
    });
    const ok = (component as any).root.findByProps({ testID: 'ok' });
    expect(ok.props.children).toBe('hi');
    (component as renderer.ReactTestRenderer).unmount();
  });
});
