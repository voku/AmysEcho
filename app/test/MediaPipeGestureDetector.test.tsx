// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MediaPipeGestureDetector } from '../src/components/MediaPipeGestureDetector';
import { CAMERA_WEBVIEW_BASE_URL } from '../src/constants';
import { logger } from '../src/utils/logger';

const GESTURE_PROCESSING_ERROR = "Das hat nicht geklappt. Probier's einfach nochmal!";

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
}));

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

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
    getOptimizedProcessingParams: jest.fn(() => ({ compressionEnabled: false })),
    compressLandmarks: jest.fn(),
    addWebViewMessage: jest.fn(),
    isInLowPowerMode: jest.fn(() => false),
    registerWebView: jest.fn(),
    unregisterWebView: jest.fn(),
  },
}));

jest.mock('../src/services/batteryOptimizationService', () => ({
  batteryOptimizationService: {
    getBatteryOptimizedParams: jest.fn(() => ({})),
  },
}));

jest.mock('../src/services/frameRateOptimizationService', () => ({
  frameRateOptimizationService: {
    getFrameRateStats: jest.fn(() => ({})),
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

    expect(errorSpy).toHaveBeenCalledWith('WebView error', { message: 'Camera access denied' });
    expect(onError).toHaveBeenCalledWith('gesture_processing_error');
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

    expect(onError).toHaveBeenCalledWith(GESTURE_PROCESSING_ERROR);
    expect(onGestureDetected).not.toHaveBeenCalled();
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

