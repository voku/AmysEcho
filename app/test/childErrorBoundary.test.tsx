jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/services/crashReporting', () => ({
  enqueueCrashReport: jest.fn(() => Promise.resolve()),
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import ChildErrorBoundary from '../src/components/ChildErrorBoundary';
import { AccessibilityContext } from '../src/components/AccessibilityContext';
import { enqueueCrashReport } from '../src/services/crashReporting';
import * as Clipboard from 'expo-clipboard';

const providerValue = { largeText: false, highContrast: false, update: () => {} };

describe('ChildErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('shows friendly message and reports error', async () => {
    const Problem = () => {
      throw new Error('boom');
    };
    let component: renderer.ReactTestRenderer;
    await act(async () => {
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
    const detail = (component as any).root.findByProps({ testID: 'error-detail' });
    expect(String(detail.props.children)).toContain('boom');
    expect(enqueueCrashReport).toHaveBeenCalled();
    component.unmount();
  });

  it('recovers after retry', async () => {
    let shouldThrow = true;
    const Switcher = () => {
      if (shouldThrow) throw new Error('fail');
      return <Text testID="ok">hi</Text>;
    };
    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <AccessibilityContext.Provider value={providerValue}>
          <ChildErrorBoundary>
            <Switcher />
          </ChildErrorBoundary>
        </AccessibilityContext.Provider>
      );
    });
    await act(async () => {
      shouldThrow = false;
      const btn = (component as any).root.findByProps({ testID: 'retry-button' });
      await btn.props.onPress();
    });
    const ok = (component as any).root.findByProps({ testID: 'ok' });
    expect(ok.props.children).toBe('hi');
    expect(() => (component as any).root.findByProps({ testID: 'error-detail' })).toThrow();
    component.unmount();
  });

  it('allows copying detailed error information', async () => {
    const capturedError = new Error('exploded');
    const Problem = () => {
      throw capturedError;
    };

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <AccessibilityContext.Provider value={providerValue}>
          <ChildErrorBoundary>
            <Problem />
          </ChildErrorBoundary>
        </AccessibilityContext.Provider>
      );
    });

    const copyButton = (component as any).root.findByProps({ testID: 'copy-error-button' });
    expect(copyButton.props.disabled).toBe(false);
    await act(async () => {
      await copyButton.props.onPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    const payload = (Clipboard.setStringAsync as jest.Mock).mock.calls[0][0];
    expect(payload).toContain('exploded');
    expect(payload).toContain('Stacktrace');

    const status = (component as any).root.findByProps({ testID: 'copy-status' });
    expect(String(status.props.children)).toContain('kopiert');

    component.unmount();
  });
});
