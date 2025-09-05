import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MediaPipeGestureDetector } from '../src/components/MediaPipeGestureDetector';
import { LanguageManager } from '../src/services/LanguageManager';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  return {
    WebView: React.forwardRef((props: any, ref) => {
      const injectJavaScript = jest.fn();
      React.useImperativeHandle(ref, () => ({ injectJavaScript }));
      return <mock-webview testID="mock-webview" {...props} injectJavaScript={injectJavaScript} />;
    }),
  };
});

jest.mock('../src/services/dgsModelClient', () => ({
  getCachedMlpModel: jest.fn(() => Promise.resolve(null)),
  fetchMlpModel: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../src/storage', () => {
  const listeners: Array<(id: string | null) => void> = [];
  return {
    loadActiveProfileId: jest.fn(() => Promise.resolve(null)),
    onActiveProfileChange: jest.fn((cb: (id: string | null) => void) => {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    }),
    __emitProfileChange: (id: string | null) => {
      listeners.forEach((cb) => cb(id));
    },
    __clearProfileListeners: () => {
      listeners.length = 0;
    },
  };
});

describe('MediaPipeGestureDetector', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    const storage = require('../src/storage');
    storage.__clearProfileListeners();
    // Suppress react-test-renderer deprecation warnings
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((message) => {
      if (!message.includes('react-test-renderer is deprecated')) {
        console.error(message);
      }
    });
    act(() => {
      LanguageManager.setLanguage('de');
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });
  it('calls onGestureDetected when a gesture message is received', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'gesture',
            gesture: 'thumbs_up',
            confidence: 0.9,
            landmarks: [[[1, 2, 3]]],
            handednesses: ['Left'],
          }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith('thumbs_up', 0.9, [[[1, 2, 3]]], ['Left'], false);
    expect(onError).not.toHaveBeenCalled();
  });

  it('parses structured two-hand gestures', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'gesture',
            gesture: { left: 'open_palm', right: 'fist' },
            confidence: 0.8,
            landmarks: [[[1, 2, 3]]],
            handednesses: ['Left', 'Right'],
          }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith(
      'open_palm+fist',
      0.8,
      [[[1, 2, 3]]],
      ['Left', 'Right'],
      false,
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('logs and forwards error messages from the WebView', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'error', message: 'Camera access denied' }),
        },
      });
    });

    expect(consoleSpy).toHaveBeenCalledWith('WebView error:', 'Camera access denied');
    expect(onError).toHaveBeenCalledWith('Camera access denied');
    expect(onGestureDetected).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs console messages from the WebView', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component.root.findByType('mock-webview');
    act(() => {
      webview.props.onConsoleMessage({ nativeEvent: { message: 'test log' } });
    });

    expect(logSpy).toHaveBeenCalledWith('WV:', 'test log');
    logSpy.mockRestore();
  });

  it('calls onError when the message data is invalid JSON', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({ nativeEvent: { data: 'invalid json' } });
    });

    expect(onError).toHaveBeenCalledWith(LanguageManager.t('mediapipe.gestureProcessingError'));
    expect(onGestureDetected).not.toHaveBeenCalled();
  });

  it('passes landmarks even when no gesture is classified', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'gesture', gesture: null, confidence: 0, landmarks: [[[1, 2, 3]]], handednesses: ['Left'] }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith(null, 0, [[[1, 2, 3]]], ['Left'], false);
    expect(onError).not.toHaveBeenCalled();
  });

  it('loads MLP model on mount', async () => {
    const { getCachedMlpModel, fetchMlpModel } = require('../src/services/dgsModelClient');
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
      await Promise.resolve();
    });

    expect(getCachedMlpModel).toHaveBeenCalled();
    expect(fetchMlpModel).toHaveBeenCalled();
  });

  it('reloads model when active profile changes', async () => {
    const { getCachedMlpModel, fetchMlpModel } = require('../src/services/dgsModelClient');
    const { __emitProfileChange } = require('../src/storage');
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
      await Promise.resolve();
    });

    expect(getCachedMlpModel).toHaveBeenCalledTimes(1);
    expect(fetchMlpModel).toHaveBeenCalledTimes(1);

    await act(async () => {
      __emitProfileChange('new');
      await Promise.resolve();
    });

    expect(getCachedMlpModel).toHaveBeenCalledTimes(2);
    expect(fetchMlpModel).toHaveBeenCalledTimes(2);
  });

  it('injects model after mlp_ready telemetry', async () => {
    const { getCachedMlpModel, fetchMlpModel } = require('../src/services/dgsModelClient');
    (getCachedMlpModel as jest.Mock).mockResolvedValue('cached');
    (fetchMlpModel as jest.Mock).mockResolvedValue('latest');
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
      await Promise.resolve();
    });

    const webview = component.root.findByType('mock-webview');
    const injectJs = webview.props.injectJavaScript as jest.Mock;
    expect(injectJs).not.toHaveBeenCalled();

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(injectJs.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(injectJs.mock.calls[0][0]).toContain('__beginMlpTransfer');
    expect(injectJs.mock.calls.some((c: any[]) => String(c[0]).includes('__pushMlpChunk'))).toBe(true);
    expect(injectJs.mock.calls[injectJs.mock.calls.length - 1][0]).toContain(
      '__commitMlpTransfer',
    );
  });

  it('updates translations when language changes', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    let webview = component.root.findByType('mock-webview');
    expect(webview.props.source.html).toContain('Tippe, um die Kamera zu starten');

    act(() => {
      LanguageManager.setLanguage('en');
    });

    webview = component.root.findByType('mock-webview');
    expect(webview.props.source.html).toContain('Tap to start camera');
  });

  it('forwards telemetry events to onWebViewEvent', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onWebViewEvent = jest.fn();

    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onWebViewEvent={onWebViewEvent}
        />,
      );
    });

    const webview = component.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'telemetry', event: 'camera_started', ms: 123, tracks: ['front-camera'] }),
        },
      });
    });

    expect(onWebViewEvent).toHaveBeenCalledWith({ event: 'camera_started', ms: 123, tracks: ['front-camera'] });
  });

  const renderHtml = (facingMode: 'user' | 'environment') => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          facingMode={facingMode}
        />,
      );
    });
    const webview = component.root.findByType('mock-webview');
    return webview.props.source.html as string;
  };

  it('mirrors video and overlay for the user-facing camera', () => {
    const html = renderHtml('user');
    expect(html).toContain('transform: scaleX(-1);');
    expect(html).toContain('window.__mirrorOverlay = true');
  });

  it('does not mirror video or overlay for the rear-facing camera', () => {
    const html = renderHtml('environment');
    expect(html).not.toContain('transform: scaleX(-1);');
    expect(html).toContain('window.__mirrorOverlay = false');
  });

  it('embeds thresholds and produces parsable script', () => {
    const html = renderHtml('user');
    expect(html).not.toContain('FALLBACK_CONFIDENCE_THRESHOLD');
    expect(html).not.toContain('MLP_CONFIDENCE_THRESHOLD');
    const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
    expect(scriptMatches.length).toBeGreaterThan(0);
    for (const [, script] of scriptMatches) {
      expect(() => new Function(script)).not.toThrow();
    }
  });
});
