// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MediaPipeGestureDetector } from '../src/components/MediaPipeGestureDetector';
import { CAMERA_WEBVIEW_BASE_URL } from '../src/constants';
import { logger } from '../src/utils/logger';

const GESTURE_PROCESSING_ERROR = 'gesture_processing_error';

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
  Paths: {
    document: { uri: '/mock/documents/' },
    cache: { uri: '/mock/cache/' },
  },
}));

jest.mock('../src/components/GestureWebView', () => {
  const React = require('react');
  return {
    GestureWebView: React.forwardRef((props: any, ref) => {
      const injectJavaScript = jest.fn();
      React.useImperativeHandle(ref, () => ({ injectJavaScript }));
      return <mock-webview testID="mock-webview" {...props} injectJavaScript={injectJavaScript} />;
    }),
  };
});

jest.mock('../src/components/OpenAIGestureFeedback', () => 'OpenAIGestureFeedback');

jest.mock('../src/services/dgsModelClient', () => ({
  getCachedMlpModel: jest.fn(() => Promise.resolve(null)),
  fetchMlpModel: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../src/storage', () => ({
  loadActiveProfileId: jest.fn(() => Promise.resolve(null)),
  onActiveProfileChange: jest.fn(() => () => {}),
}));

jest.mock('../src/services/contextAwareRecognitionService', () => ({
  contextAwareRecognitionService: {
    resetSession: jest.fn(),
  },
}));

jest.mock('../src/services/performanceOptimizationService', () => ({
  performanceOptimizationService: {
    updateMetrics: jest.fn(),
    getMetrics: jest.fn(() => ({ gestureProcessingTime: 0, lastUpdated: Date.now() })),
    cleanup: jest.fn(),
  },
}));

jest.mock('../src/hooks/useModelInjection', () => ({
  useModelInjection: () => ({
    injectModel: jest.fn(),
    mlpReadyRef: { current: false },
    pendingModelRef: { current: null },
  }),
}));

jest.mock('../src/hooks/useOpenAIValidation', () => ({
  useOpenAIValidation: () => ({
    openaiValidationResult: null,
    setOpenaiValidationResult: jest.fn(),
    showOpenaiFeedback: false,
    setShowOpenaiFeedback: jest.fn(),
    handleOpenAIValidation: jest.fn(),
  }),
}));

const mockHandleParallelProcessing = jest.fn();
jest.mock('../src/hooks/useParallelProcessing', () => ({
  useParallelProcessing: () => ({
    handleParallelProcessing: mockHandleParallelProcessing,
  }),
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('MediaPipeGestureDetector', () => {
  let component: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (component) {
      act(() => component!.unmount());
      component = null;
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });


  it('logs and forwards error messages from the WebView', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'error', message: 'Camera access denied' }) },
      });
    });

    expect(errorSpy).toHaveBeenCalledWith('WebView error', {
      message: 'Camera access denied',
      code: undefined,
    });
    expect(onError).toHaveBeenCalledWith('Camera access denied');
    expect(onGestureDetected).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('logs console messages from the WebView', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onConsoleMessage({ nativeEvent: { message: 'test log' } });
    });

    expect(debugSpy).toHaveBeenCalledWith('WebView console message', 'test log');
    debugSpy.mockRestore();
  });

  it('applies gesture size tolerance to the WebView and updates when the prop changes', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          gestureSizeTolerance={0.45}
        />,
      );
    });

    const initialWebview = component!.root.findByType('mock-webview');
    const initialInject = initialWebview.props.injectJavaScript as jest.Mock;

    expect(initialWebview.props.htmlContent).toContain('window.__gestureSizeTolerance = 0.45;');
    expect(initialInject).toHaveBeenCalledWith(expect.stringContaining('0.45'));

    act(() => {
      component!.update(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          gestureSizeTolerance={0.6}
        />,
      );
    });

    const updatedWebview = component!.root.findByType('mock-webview');
    const updatedInject = updatedWebview.props.injectJavaScript as jest.Mock;

    expect(updatedWebview.props.htmlContent).toContain('window.__gestureSizeTolerance = 0.6;');
    expect(updatedInject).toHaveBeenCalledWith(expect.stringContaining('0.6'));

    if (updatedInject === initialInject) {
      expect(updatedInject).toHaveBeenCalledTimes(2);
    } else {
      expect(initialInject).toHaveBeenCalledTimes(1);
      expect(updatedInject).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onError when the message data is invalid JSON', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({ nativeEvent: { data: 'invalid json' } });
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Unexpected token'));
    expect(onGestureDetected).not.toHaveBeenCalled();
  });

  it('processes gesture batches emitted from the WebView bridge', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onWebViewEvent = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onWebViewEvent={onWebViewEvent}
        />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const batchPayload = {
      type: 'gesture_batch',
      messageCount: 2,
      frameCount: 12,
      lastSentAt: 123456,
      messages: [
        { type: 'gesture', gesture: 'hallo', confidence: 0.82, landmarks: [[[0, 0, 0]]] },
        { type: 'gesture', gesture: 'hilfe', confidence: 0.41 },
      ],
    };

    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify(batchPayload) } });
    });

    expect(onGestureDetected).toHaveBeenNthCalledWith(
      1,
      'hallo',
      0.82,
      [[[0, 0, 0]]],
      [],
      null,
    );
    expect(onGestureDetected).toHaveBeenNthCalledWith(2, 'hilfe', 0.41, [], [], null);
    expect(onWebViewEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'telemetry',
        event: 'gesture_batch_received',
        batchSize: 2,
        processedCount: 2,
        messageCount: 2,
        frameCount: 12,
        lastSentAt: 123456,
      })
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('passes handedness information from gesture messages', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const payload = {
      type: 'gesture',
      gesture: 'thumbs_up',
      confidence: 0.9,
      landmarks: [[[0.1, 0.2, 0.0]]],
      handednesses: ['Left'],
    };

    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify(payload) } });
    });

    expect(onGestureDetected).toHaveBeenCalledWith(
      'thumbs_up',
      0.9,
      [[[0.1, 0.2, 0.0]]],
      ['Left'],
      null,
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('forwards frame capture payloads for OpenAI fallback handling', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const payload = {
      type: 'gesture',
      gesture: 'hilfe',
      confidence: 0.42,
      landmarks: [],
      handednesses: [],
      frameCapture: 'data:image/jpeg;base64,ZmFrZUJhc2U2NA==',
    };

    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify(payload) } });
    });

    expect(onGestureDetected).toHaveBeenCalledWith(
      'hilfe',
      0.42,
      [],
      [],
      'data:image/jpeg;base64,ZmFrZUJhc2U2NA==',
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports processedCount only for valid gesture messages in a batch', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onWebViewEvent = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onWebViewEvent={onWebViewEvent}
        />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const batchPayload = {
      type: 'gesture_batch',
      messageCount: 4,
      messages: [
        { type: 'gesture', gesture: 'hallo', confidence: 0.9 },
        null,
        'not-an-object',
        { type: 'gesture', gesture: 'hilfe', confidence: 0.4 },
      ],
    };

    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify(batchPayload) } });
    });

    expect(onGestureDetected).toHaveBeenCalledTimes(2);
    expect(onWebViewEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'telemetry',
        event: 'gesture_batch_received',
        batchSize: 4,
        processedCount: 2,
      })
    );
  });

    it('handles permission requests', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const grant = jest.fn();
    const deny = jest.fn();
    act(() => {
        webview.props.onPermissionRequest({
          nativeEvent: {
            origin: `${CAMERA_WEBVIEW_BASE_URL}/`,
            resources: ['VIDEO_CAPTURE', 'AUDIO_CAPTURE'],
            grant,
            deny,
          },
        });
      });

    expect(grant).toHaveBeenCalledWith(['VIDEO_CAPTURE']);
    expect(deny).not.toHaveBeenCalled();
  });

    it('denies permission requests from unknown origins', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const grant = jest.fn();
    const deny = jest.fn();
    act(() => {
        webview.props.onPermissionRequest({
          nativeEvent: {
            origin: 'https://example.com/',
            resources: ['VIDEO_CAPTURE'],
            grant,
            deny,
          },
        });
      });

      expect(grant).not.toHaveBeenCalled();
      expect(deny).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('denies microphone-only requests even from allowed origin', () => {
      const onGestureDetected = jest.fn();
      const onError = jest.fn();

      act(() => {
        component = renderer.create(
          <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
        );
      });

      const webview = component!.root.findByType('mock-webview');
      const grant = jest.fn();
      const deny = jest.fn();
      act(() => {
        webview.props.onPermissionRequest({
          nativeEvent: {
            origin: `${CAMERA_WEBVIEW_BASE_URL}/`,
            resources: ['AUDIO_CAPTURE'],
            grant,
            deny,
          },
        });
      });

      expect(grant).not.toHaveBeenCalled();
      expect(deny).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('denies permission requests with invalid origin', () => {
      const onGestureDetected = jest.fn();
      const onError = jest.fn();

      act(() => {
        component = renderer.create(
          <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
        );
      });

      const webview = component!.root.findByType('mock-webview');
      const grant = jest.fn();
      const deny = jest.fn();
      act(() => {
        webview.props.onPermissionRequest({
          nativeEvent: {
            origin: '::::',
            resources: ['VIDEO_CAPTURE'],
            grant,
            deny,
          },
        });
      });

      expect(grant).not.toHaveBeenCalled();
      expect(deny).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

