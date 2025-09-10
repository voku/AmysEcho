// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MediaPipeGestureDetector } from '../src/components/MediaPipeGestureDetector';
import { LanguageManager } from '../src/services/LanguageManager';

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
}));

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

jest.mock('../src/services/twoHandGestureService', () => ({
  twoHandGestureService: {
    processTwoHandGesture: jest.fn(),
    getCachedGesture: jest.fn(),
    clearCache: jest.fn(),
    getPerformanceMetrics: jest.fn(),
  },
}));

jest.mock('../src/services/performanceMonitor', () => ({
  performanceMonitor: {
    recordMetric: jest.fn(),
    recordProcessingTime: jest.fn(),
  },
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

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('MediaPipeGestureDetector', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let component: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    const storage = require('../src/storage');
    storage.__clearProfileListeners();
    // Suppress react-test-renderer deprecation warnings
    const orig = console.error;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((message) => {
      if (!String(message).includes('react-test-renderer is deprecated')) {
        orig(message);
      }
    });
    act(() => {
      LanguageManager.setLanguage('de');
    });
  });

  afterEach(() => {
    if (component) {
      act(() => component!.unmount());
      component = null;
    }
    jest.runOnlyPendingTimers();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });
  it('calls onGestureDetected when a gesture message is received', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
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

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');
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

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'error', message: 'Camera access denied' }),
        },
      });
    });

    expect(consoleSpy).toHaveBeenCalledWith('WebView error:', 'Camera access denied');
    expect(onError).toHaveBeenCalledWith('gesture_processing_error');
    expect(onGestureDetected).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs console messages from the WebView', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onConsoleMessage({ nativeEvent: { message: 'test log' } });
    });

    expect(logSpy).toHaveBeenCalledWith('WV:', 'test log');
    logSpy.mockRestore();
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

    expect(onError).toHaveBeenCalledWith(LanguageManager.t('mediapipe.gestureProcessingError'));
    expect(onGestureDetected).not.toHaveBeenCalled();
  });

  it('passes landmarks even when no gesture is classified', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
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
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });
    await flushPromises();

    expect(getCachedMlpModel).toHaveBeenCalled();
    expect(fetchMlpModel).toHaveBeenCalled();
  });

  it('reloads model when active profile changes', async () => {
    const { getCachedMlpModel, fetchMlpModel } = require('../src/services/dgsModelClient');
    const { __emitProfileChange } = require('../src/storage');
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });
    await flushPromises();

    expect(getCachedMlpModel).toHaveBeenCalledTimes(1);
    expect(fetchMlpModel).toHaveBeenCalledTimes(1);

    await act(async () => {
      __emitProfileChange('new');
    });
    await flushPromises();

    expect(getCachedMlpModel).toHaveBeenCalledTimes(2);
    expect(fetchMlpModel).toHaveBeenCalledTimes(2);
  });

  it('injects model after mlp_ready telemetry', async () => {
    const { getCachedMlpModel, fetchMlpModel } = require('../src/services/dgsModelClient');
    (getCachedMlpModel as jest.Mock).mockResolvedValue('cached');
    (fetchMlpModel as jest.Mock).mockResolvedValue('latest');
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });
    await flushPromises();

    const webview = component!.root.findByType('mock-webview');
    const injectJs = webview.props.injectJavaScript as jest.Mock;
    const initialCalls = injectJs.mock.calls.length;

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(injectJs.mock.calls.length).toBeGreaterThan(initialCalls);
    expect(injectJs.mock.calls.some((c: any[]) => String(c[0]).includes('__beginMlpTransfer'))).toBe(true);
    expect(injectJs.mock.calls.some((c: any[]) => String(c[0]).includes('__pushMlpChunk'))).toBe(true);
    expect(injectJs.mock.calls.some((c: any[]) => String(c[0]).includes('__commitMlpTransfer'))).toBe(true);
  });

  it('updates translations when language changes', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    let webview = component!.root.findByType('mock-webview');
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

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onWebViewEvent={onWebViewEvent}
        />,
      );
    });

    const webview = component!.root.findByType('mock-webview');
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
    let local: renderer.ReactTestRenderer;
    act(() => {
      local = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          facingMode={facingMode}
        />,
      );
    });
    const webview = local.root.findByType('mock-webview');
    const html = webview.props.source.html as string;
    act(() => local.unmount());
    return html;
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



  it('handles partial feedback messages', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onPartialFeedback = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onPartialFeedback={onPartialFeedback}
        />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'partial_feedback',
            gesture: 'thumbs_up',
            completion: 0.7,
            feedback: 'Good progress!',
          }),
        },
      });
    });

    expect(onPartialFeedback).toHaveBeenCalledWith('thumbs_up', 0.7, 'Good progress!');
  });

  it('handles stability feedback messages', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onStabilityFeedback = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onStabilityFeedback={onStabilityFeedback}
        />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'stability_feedback',
            isStable: true,
            stabilityScore: 0.85,
            feedback: 'Hand is stable',
          }),
        },
      });
    });

    expect(onStabilityFeedback).toHaveBeenCalledWith(true, 0.85, 'Hand is stable');
  });

  it('handles emergency gestures', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'gesture',
            gesture: 'help',
            confidence: 0.95,
            landmarks: [[[1, 2, 3]]],
            handednesses: ['Left'],
            emergency: true,
          }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith('help', 0.95, [[[1, 2, 3]]], ['Left'], true);
  });

  it('handles model update status callbacks', async () => {
    const onModelUpdateStatus = jest.fn();
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onModelUpdateStatus={onModelUpdateStatus}
        />
      );
    });
    await flushPromises();

    const webview = component!.root.findByType('mock-webview');

    // Simulate mlp_ready
    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(onModelUpdateStatus).toHaveBeenCalledWith('updating');

    // Simulate transfer complete
    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_transfer_complete' }) },
      });
    });

    expect(onModelUpdateStatus).toHaveBeenCalledWith('complete');
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

    act(() => {
      webview.props.onPermissionRequest({
        nativeEvent: {
          resources: ['VIDEO_CAPTURE', 'AUDIO_CAPTURE'],
          grant,
        },
      });
    });

    expect(grant).toHaveBeenCalledWith(['VIDEO_CAPTURE']);
  });

  it('handles invalid gesture objects gracefully', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');

    // Test invalid gesture object
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'gesture',
            gesture: { left: 'thumbs_up' }, // Missing right
            confidence: 0.8,
            landmarks: [[[1, 2, 3]]],
            handednesses: ['Left'],
          }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith(null, 0.8, [[[1, 2, 3]]], ['Left'], false);
  });

  it('handles profile loading errors gracefully', async () => {
    const { loadActiveProfileId } = require('../src/storage');
    (loadActiveProfileId as jest.Mock).mockRejectedValue(new Error('Storage error'));

    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
      await Promise.resolve();
    });

    // Should not crash, should continue with null profile
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles WebView load errors', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onError({ nativeEvent: { description: 'Network error' } });
    });

    expect(onError).toHaveBeenCalledWith('webview_load_error');
  });

  it('handles WebView http errors', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onHttpError({ nativeEvent: { statusCode: 404, url: 'test.html' } });
    });

    expect(onError).toHaveBeenCalledWith('webview_http_error');
  });

  it('forwards frame latency telemetry with tracks', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onWebViewEvent = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} onWebViewEvent={onWebViewEvent} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'telemetry', event: 'frame_latency', ms: 16, tracks: ['front-camera'] }),
        },
      });
    });

    expect(onWebViewEvent).toHaveBeenCalledWith({ event: 'frame_latency', ms: 16, tracks: ['front-camera'] });
  });

  it('continues emitting gestures across MLP transfer lifecycle', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onModelUpdateStatus = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onModelUpdateStatus={onModelUpdateStatus}
        />,
      );
    });

    const webview = component!.root.findByType('mock-webview');

    // Signal mlp_ready and ensure we can still process gestures before transfer completes
    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) } });
    });

    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'gesture', gesture: 'hello', confidence: 0.9, landmarks: [[[1,2,3]]], handednesses: ['Left'] }),
        },
      });
    });
    expect(onGestureDetected).toHaveBeenCalledTimes(1);

    // Now signal transfer complete and ensure gestures still flow
    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_transfer_complete' }) } });
    });
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'gesture', gesture: 'danke', confidence: 0.8, landmarks: [[[4,5,6]]], handednesses: ['Right'] }),
        },
      });
    });
    expect(onGestureDetected).toHaveBeenCalledTimes(2);
  });

  it('marks update complete on mlp_transfer_skipped', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onModelUpdateStatus = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onModelUpdateStatus={onModelUpdateStatus}
        />,
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_transfer_skipped' }) } });
    });
    expect(onModelUpdateStatus).toHaveBeenCalledWith('complete');
  });

  it('handles burst of gesture events without blocking', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    for (let i = 0; i < 10; i++) {
      act(() => {
        webview.props.onMessage({
          nativeEvent: {
            data: JSON.stringify({ type: 'gesture', gesture: `g${i}`, confidence: 0.5, landmarks: [[[i, i, i]]], handednesses: ['Left'] }),
          },
        });
      });
    }
    expect(onGestureDetected).toHaveBeenCalledTimes(10);
  });

  it('handles malformed gesture objects with null values', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'gesture',
            gesture: null,
            confidence: null,
            landmarks: null,
            handednesses: null,
          }),
        },
      });
    });

    expect(onGestureDetected).toHaveBeenCalledWith(null, 0, [], [], false);
  });

  it('handles model loading failures', async () => {
    const { getCachedMlpModel, fetchMlpModel } = require('../src/services/dgsModelClient');
    (getCachedMlpModel as jest.Mock).mockRejectedValue(new Error('Model load failed'));
    (fetchMlpModel as jest.Mock).mockRejectedValue(new Error('Fetch failed'));

    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
      await Promise.resolve();
    });

    // Should not crash, should continue without model
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles telemetry events without onWebViewEvent callback', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'telemetry', event: 'test_event' }),
        },
      });
    });

    // Should not crash when onWebViewEvent is not provided
    expect(onGestureDetected).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles unknown message types gracefully', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    act(() => {
      webview.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({ type: 'unknown_type', data: 'test' }),
        },
      });
    });

    // Should not crash on unknown message types
    expect(onGestureDetected).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles gesture size tolerance parameter', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          gestureSizeTolerance={0.8}
        />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const html = webview.props.source.html as string;
    expect(html).toContain('window.__gestureSizeTolerance = 0.8');
  });

  it('handles model update status without callback', async () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />
      );
      await Promise.resolve();
    });

    const webview = component!.root.findByType('mock-webview');

    // Should not crash when onModelUpdateStatus is not provided
    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(onGestureDetected).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
