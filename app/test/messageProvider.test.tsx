import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

jest.mock('../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false }),
}));

import { MessageProvider, useMessage } from '../src/context/MessageContext';
import ErrorMessage from '../src/components/ErrorMessage';

describe('MessageProvider', () => {
  it('queues structured toasts', () => {
    const TestChild = () => {
      const { showToast } = useMessage();
      React.useEffect(() => {
        showToast({ message: 'Erste Meldung', tone: 'info', durationMs: 0 });
        showToast({ message: 'Zweite Meldung', tone: 'warning', durationMs: 0 });
      }, [showToast]);
      return null;
    };

    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MessageProvider>
          <TestChild />
        </MessageProvider>,
      );
    });

    const error = component.root.findByType(ErrorMessage as any);
    expect(error.props.toasts).toHaveLength(2);
    expect(error.props.toasts[0].message).toBe('Erste Meldung');
    expect(error.props.toasts[1].tone).toBe('warning');
    act(() => {
      component.unmount();
    });
  });

  it('auto-dismisses toasts after their duration', () => {
    jest.useFakeTimers();
    const TestChild = () => {
      const { showToast } = useMessage();
      React.useEffect(() => {
        showToast({ message: 'Kurzlebig', tone: 'info', durationMs: 1000 });
      }, [showToast]);
      return null;
    };

    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MessageProvider>
          <TestChild />
        </MessageProvider>,
      );
    });

    const getToasts = () => component.root.findByType(ErrorMessage as any).props.toasts as any[];
    expect(getToasts()).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(getToasts()).toHaveLength(0);
    jest.useRealTimers();
    act(() => {
      component.unmount();
    });
  });

  it('exposes debug log entries and toggle', () => {
    const TestChild = () => {
      const { showToast, toggleDebug, logEntries, isDebugVisible } = useMessage();
      React.useEffect(() => {
        showToast({ message: 'Debug', tone: 'error', durationMs: 0 });
        toggleDebug();
      }, [showToast, toggleDebug]);
      return <Text testID="debug-state">{`${isDebugVisible}:${logEntries.length}`}</Text>;
    };

    let component!: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MessageProvider>
          <TestChild />
        </MessageProvider>,
      );
    });

    const debugState = component.root.findByProps({ testID: 'debug-state' });
    expect(debugState.props.children).toBe('true:1');
    const error = component.root.findByType(ErrorMessage as any);
    expect(error.props.isDebugVisible).toBe(true);
    expect(error.props.logEntries).toHaveLength(1);
    act(() => {
      component.unmount();
    });
  });
});
