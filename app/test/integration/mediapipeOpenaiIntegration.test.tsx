/**
 * Integration tests for the MediaPipe gesture detector WebView orchestration.
 *
 * These specs focus on the new offline-first workflow where the modular
 * WebView bundle emits telemetry events and gesture payloads that the
 * React Native wrapper needs to interpret.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { MediaPipeGestureDetector } from '../../src/components/MediaPipeGestureDetector';

const mockUseModelInjection = jest.fn();

jest.mock('../../src/hooks/useModelInjection', () => ({
  useModelInjection: (...args: any[]) => mockUseModelInjection(...args),
}));

const mockGetCachedMlpModel = jest.fn();
const mockFetchMlpModel = jest.fn();
const mockGetCachedMlpMeta = jest.fn();

jest.mock('../../src/services/dgsModelClient', () => ({
  getCachedMlpModel: (...args: any[]) => mockGetCachedMlpModel(...args),
  fetchMlpModel: (...args: any[]) => mockFetchMlpModel(...args),
  getCachedMlpMeta: (...args: any[]) => mockGetCachedMlpMeta(...args),
}));

const mockLoadActiveProfileId = jest.fn();
const mockOnActiveProfileChange = jest.fn();

jest.mock('../../src/storage', () => ({
  loadActiveProfileId: (...args: any[]) => mockLoadActiveProfileId(...args),
  onActiveProfileChange: (...args: any[]) => mockOnActiveProfileChange(...args),
}));

const latestWebView: { props: any | null; instance: any | null } = {
  props: null,
  instance: null,
};

jest.mock('../../src/components/GestureWebView', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureWebView: React.forwardRef((props: any, ref) => {
      const instance = {
        injectJavaScript: jest.fn(),
      };

      React.useImperativeHandle(ref, () => instance);
      React.useEffect(() => {
        latestWebView.props = props;
        latestWebView.instance = instance;
        return () => {
          latestWebView.props = null;
          latestWebView.instance = null;
        };
      }, [props]);

      return React.createElement(View, { testID: 'gesture-webview' });
    }),
  };
});

const styleSheetModule = require('react-native/Libraries/StyleSheet/StyleSheet');
if (!styleSheetModule.flatten) {
  styleSheetModule.flatten = (style: any) => style;
}
try {
  const rn = require('react-native');
  if (!rn.StyleSheet) {
    rn.StyleSheet = styleSheetModule;
  } else if (!rn.StyleSheet.flatten) {
    rn.StyleSheet.flatten = styleSheetModule.flatten.bind(styleSheetModule);
  }
} catch {}

global.fetch = jest.fn();

const advanceMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('MediaPipeGestureDetector (WebView integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestWebView.props = null;
    latestWebView.instance = null;
    mockLoadActiveProfileId.mockResolvedValue(null);
    mockOnActiveProfileChange.mockReturnValue(() => {});
    mockGetCachedMlpModel.mockResolvedValue(null);
    mockGetCachedMlpMeta.mockResolvedValue(null);
    mockFetchMlpModel.mockResolvedValue(null);
  });

  const setupHookMocks = () => {
    const injectModel = jest.fn();
    const markTransferComplete = jest.fn();
    const mlpReadyRef = { current: false };
    const pendingModelRef = { current: null as string | null };
    mockUseModelInjection.mockReturnValue({
      injectModel,
      markTransferComplete,
      mlpReadyRef,
      pendingModelRef,
    });
    return { injectModel, markTransferComplete, mlpReadyRef, pendingModelRef };
  };

  it('forwards gesture payloads from the WebView to the callback', async () => {
    setupHookMocks();

    const onGestureDetected = jest.fn();

    render(
      <MediaPipeGestureDetector
        onGestureDetected={onGestureDetected}
        onError={jest.fn()}
      />,
    );

    await advanceMicrotasks();
    expect(latestWebView.props?.onMessage).toBeDefined();

    await act(async () => {
      latestWebView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'gesture',
            gesture: 'hello',
            confidence: 0.82,
            landmarks: [[[0.1, 0.2, 0.3]]],
            metadata: {
              method: 'mlp',
              processingTime: 12,
            },
          }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith(
      'hello',
      0.82,
      [[[0.1, 0.2, 0.3]]],
      [],
      false,
      null,
    );
  });

  it('injects pending models once the WebView reports mlp readiness', async () => {
    const { injectModel, mlpReadyRef, pendingModelRef } = setupHookMocks();

    render(
      <MediaPipeGestureDetector
        onGestureDetected={jest.fn()}
        onError={jest.fn()}
      />,
    );

    await advanceMicrotasks();
    expect(latestWebView.props?.onMessage).toBeDefined();

    pendingModelRef.current = 'b64-model';

    await act(async () => {
      latestWebView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }),
        },
      });
    });

    expect(mlpReadyRef.current).toBe(true);
    expect(injectModel).toHaveBeenCalledWith('b64-model');
  });

  it('marks transfers complete when the WebView confirms success', async () => {
    const { markTransferComplete } = setupHookMocks();
    const onModelUpdateStatus = jest.fn();

    render(
      <MediaPipeGestureDetector
        onGestureDetected={jest.fn()}
        onError={jest.fn()}
        onModelUpdateStatus={onModelUpdateStatus}
      />,
    );

    await advanceMicrotasks();

    await act(async () => {
      latestWebView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'telemetry', event: 'mlp_transfer_complete' }),
        },
      });
    });

    expect(markTransferComplete).toHaveBeenCalled();
    expect(onModelUpdateStatus).toHaveBeenCalledWith('complete');
  });

  it('surfaces WebView errors and shows the fallback overlay', async () => {
    setupHookMocks();
    const onError = jest.fn();

    render(
      <MediaPipeGestureDetector
        onGestureDetected={jest.fn()}
        onError={onError}
      />,
    );

    await advanceMicrotasks();

    await act(async () => {
      latestWebView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'error', message: 'inline_bundle_failed' }),
        },
      });
    });

    expect(onError).toHaveBeenCalledWith('inline_bundle_failed');
  });

  it('forwards telemetry events to the optional callback', async () => {
    setupHookMocks();
    const onWebViewEvent = jest.fn();

    render(
      <MediaPipeGestureDetector
        onGestureDetected={jest.fn()}
        onError={jest.fn()}
        onWebViewEvent={onWebViewEvent}
      />,
    );

    await advanceMicrotasks();

    await act(async () => {
      latestWebView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'telemetry', event: 'dom_ready' }),
        },
      });
    });

    expect(onWebViewEvent).toHaveBeenCalledWith({ type: 'telemetry', event: 'dom_ready' });
  });

  it('reports malformed messages as gesture processing errors', async () => {
    setupHookMocks();
    const onError = jest.fn();

    render(
      <MediaPipeGestureDetector
        onGestureDetected={jest.fn()}
        onError={onError}
      />,
    );

    await advanceMicrotasks();

    await act(async () => {
      latestWebView.props.onMessage({
        nativeEvent: {
          data: 'not-json',
        },
      });
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('not-json'));
  });
});
