// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Camera } from 'expo-camera';
import { Platform } from 'react-native';
import { MediaPipeGestureDetector } from '../src/components/MediaPipeGestureDetector';
import { CAMERA_WEBVIEW_BASE_URL } from '../src/constants';
import { logger } from '../src/utils/logger';

const GESTURE_PROCESSING_ERROR = 'gesture_processing_error';

const injectModelMock = jest.fn();
const markTransferCompleteMock = jest.fn();
const mlpReadyRef = { current: false } as { current: boolean };
const pendingModelRef = { current: null } as { current: string | null };
const pendingModelContextRef = { current: null } as {
  current: { profileId?: string | null; version?: string | null; source?: string; cached?: boolean } | null;
};
const requeueLastModelMock = jest.fn();
const resetTransferStateMock = jest.fn();
const mockUseModelInjection = jest.fn();

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
  Paths: {
    document: { uri: '/mock/documents/' },
    cache: { uri: '/mock/cache/' },
  },
}));

jest.mock('expo-camera');

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

jest.mock('../src/hooks/useModelInjection', () => ({
  useModelInjection: (...args: any[]) => mockUseModelInjection(...args),
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
    injectModelMock.mockReset();
    markTransferCompleteMock.mockReset();
    requeueLastModelMock.mockReset();
    requeueLastModelMock.mockReturnValue(false);
    resetTransferStateMock.mockReset();
    mlpReadyRef.current = false;
    pendingModelRef.current = null;
    pendingModelContextRef.current = null;
    mockUseModelInjection.mockReturnValue({
      injectModel: injectModelMock,
      mlpReadyRef,
      pendingModelRef,
      pendingModelContextRef,
      markTransferComplete: markTransferCompleteMock,
      requeueLastModel: requeueLastModelMock,
      resetTransferState: resetTransferStateMock,
    });
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

  it('replays the last injected model after a facing mode change triggers a WebView reload', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    requeueLastModelMock.mockReturnValue(true);

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          facingMode="user"
        />
      );
    });

    const initialWebview = component!.root.findByType('mock-webview');

    act(() => {
      initialWebview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }) },
      });
    });

    expect(mlpReadyRef.current).toBe(false);

    act(() => {
      component!.update(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          facingMode="environment"
        />
      );
    });

    const reloadedWebview = component!.root.findByType('mock-webview');

    act(() => {
      reloadedWebview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(requeueLastModelMock).toHaveBeenCalledTimes(1);
  });

  it('notifies camera state changes from telemetry events', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onCameraStateChange = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onCameraStateChange={onCameraStateChange}
        />,
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const emitTelemetry = (event: string) => {
      act(() => {
        webview.props.onMessage({
          nativeEvent: { data: JSON.stringify({ type: 'telemetry', event }) },
        });
      });
    };

    emitTelemetry('dom_ready');
    emitTelemetry('camera_started');
    emitTelemetry('camera_start_failed');
    emitTelemetry('camera_start_hook_success');
    emitTelemetry('camera_start_hook_error');
    emitTelemetry('cleanup_done');

    expect(onCameraStateChange.mock.calls.map((call) => call[0])).toEqual([
      'dom_ready',
      'camera_started',
      'camera_start_failed',
      'camera_start_hook_success',
      'camera_start_hook_error',
      'cleanup_done',
    ]);
  });

  it('requests native camera permissions before injecting the camera start hook', async () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const getSpy = jest
      .spyOn(Camera, 'getCameraPermissionsAsync')
      .mockResolvedValue({ granted: false });
    const requestSpy = jest
      .spyOn(Camera, 'requestCameraPermissionsAsync')
      .mockResolvedValue({ granted: true });

    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');

    await act(async () => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'dom_ready' }) },
      });
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(requestSpy).toHaveBeenCalled();
    expect((webview.props.injectJavaScript as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    getSpy.mockRestore();
    requestSpy.mockRestore();
  });

  it('shows the permission prompt overlay when native permissions are denied', async () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    jest.spyOn(Camera, 'getCameraPermissionsAsync').mockResolvedValue({ granted: false });
    jest.spyOn(Camera, 'requestCameraPermissionsAsync').mockResolvedValue({ granted: false });

    await act(async () => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');

    await act(async () => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'dom_ready' }) },
      });
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    const prompt = component!.root
      .findAllByType('Text')
      .find(
        (node) => node.props.children === 'Bitte erlaube den Kamerazugriff, damit wir loslegen können.',
      );

    expect(prompt).toBeTruthy();
    expect(webview.props.injectJavaScript as jest.Mock).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('starts the camera when the microphone permission is denied on Android', async () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android' });

    jest.spyOn(Camera, 'getCameraPermissionsAsync').mockResolvedValue({ granted: true });
    jest.spyOn(Camera, 'getMicrophonePermissionsAsync').mockResolvedValue({ granted: false });
    const requestMicSpy = jest
      .spyOn(Camera, 'requestMicrophonePermissionsAsync')
      .mockResolvedValue({ granted: false });

    try {
      await act(async () => {
        component = renderer.create(
          <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
        );
      });

      const webview = component!.root.findByType('mock-webview');

      await act(async () => {
        webview.props.onMessage({
          nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'dom_ready' }) },
        });
        jest.runOnlyPendingTimers();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(requestMicSpy).toHaveBeenCalled();
      expect((webview.props.injectJavaScript as jest.Mock).mock.calls.length).toBeGreaterThan(0);

      const permissionPrompt = component!.root
        .findAllByType('Text')
        .find(
          (node) =>
            node.props.children === 'Bitte erlaube den Kamerazugriff, damit wir loslegen können.',
        );

      expect(permissionPrompt).toBeUndefined();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS });
      jest.restoreAllMocks();
    }
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

  it('forwards landmark payloads that arrive within gesture batches', () => {
    const onGestureDetected = jest.fn();
    const onLandmarks = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onLandmarks={onLandmarks}
          onError={onError}
        />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const batchPayload = {
      type: 'gesture_batch',
      messageCount: 1,
      frameCount: 4,
      lastSentAt: 987654,
      messages: [
        {
          type: 'landmarks',
          landmarks: [[[0.1, 0.2, 0.3]]],
          handedness: ['Right'],
        },
      ],
    };

    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify(batchPayload) } });
    });

    expect(onLandmarks).toHaveBeenCalledTimes(1);
    expect(onLandmarks).toHaveBeenCalledWith([[[0.1, 0.2, 0.3]]], ['Right']);
    expect(onGestureDetected).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('forwards frame batches that are included in gesture batches', () => {
    const onFrameBatch = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onFrameBatch={onFrameBatch} onGestureDetected={jest.fn()} onError={onError} />
      );
    });

    const webview = component!.root.findByType('mock-webview');
    const frameBatchPayload = {
      type: 'gesture_batch',
      messageCount: 1,
      frameCount: 6,
      lastSentAt: 24680,
      messages: [
        {
          type: 'FRAME_BATCH',
          frames: ['data:image/jpeg;base64,frameA'],
          landmarks: [[[[0.1, 0.2, 0.3]]]],
          handednesses: [['Left']],
          timestamps: [111],
        },
      ],
    };

    act(() => {
      webview.props.onMessage({ nativeEvent: { data: JSON.stringify(frameBatchPayload) } });
    });

    expect(onFrameBatch).toHaveBeenCalledTimes(1);
    expect(onFrameBatch).toHaveBeenCalledWith({
      frames: ['data:image/jpeg;base64,frameA'],
      landmarks: [[[[0.1, 0.2, 0.3]]]],
      handednesses: [['Left']],
      timestamps: [111],
    });
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

  it('injects a queued model once the WebView reports mlp_ready', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const queuedContext = {
      profileId: 'profile-123',
      version: '1.2.3',
      source: 'prefetch',
      cached: true,
    };

    pendingModelRef.current = 'queued-model-payload';
    pendingModelContextRef.current = queuedContext;
    mlpReadyRef.current = false;

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(mlpReadyRef.current).toBe(true);
    expect(injectModelMock).toHaveBeenCalledWith('queued-model-payload', queuedContext);
    expect(pendingModelRef.current).toBeNull();
    expect(pendingModelContextRef.current).toBeNull();
    expect(requeueLastModelMock).not.toHaveBeenCalled();
  });

  it('restores a queued model if injection fails after mlp_ready', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const queuedContext = {
      profileId: 'profile-123',
      version: '1.2.3',
      source: 'prefetch',
      cached: true,
    };

    pendingModelRef.current = 'queued-model-payload';
    pendingModelContextRef.current = queuedContext;
    mlpReadyRef.current = false;

    injectModelMock.mockImplementationOnce(() => {
      throw new Error('inject failure');
    });

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(mlpReadyRef.current).toBe(true);
    expect(injectModelMock).toHaveBeenCalledWith('queued-model-payload', queuedContext);
    expect(pendingModelRef.current).toBe('queued-model-payload');
    expect(pendingModelContextRef.current).toEqual(queuedContext);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('inject failure'));
  });

  it('requeues the stored model when the WebView reloads without a pending payload', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');

    requeueLastModelMock.mockImplementationOnce(() => {
      injectModelMock('replayed-model', { source: 'replay' });
      return true;
    });

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(requeueLastModelMock).toHaveBeenCalledTimes(1);
    expect(injectModelMock).toHaveBeenCalledWith('replayed-model', { source: 'replay' });
    expect(logger.info).toHaveBeenCalledWith('Replaying stored MLP model after WebView reload');
  });

  it('resets readiness when the WebView reports cleanup_done', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();

    mlpReadyRef.current = true;

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector onGestureDetected={onGestureDetected} onError={onError} />,
      );
    });

    const webview = component!.root.findByType('mock-webview');

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }) },
      });
    });

    expect(mlpReadyRef.current).toBe(false);
    expect(resetTransferStateMock).toHaveBeenCalledTimes(1);
  });

  it('replays the last model and completes transfer after a camera swap', () => {
    const onGestureDetected = jest.fn();
    const onError = jest.fn();
    const onModelUpdateStatus = jest.fn();

    const queuedContext = {
      profileId: 'profile-queued',
      version: '9.9.9',
      source: 'initial',
      cached: true,
    };

    pendingModelRef.current = 'initial-model';
    pendingModelContextRef.current = queuedContext;

    act(() => {
      component = renderer.create(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onModelUpdateStatus={onModelUpdateStatus}
          facingMode="user"
        />,
      );
    });

    let webview = component!.root.findByType('mock-webview');

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(injectModelMock).toHaveBeenCalledWith('initial-model', queuedContext);
    expect(requeueLastModelMock).not.toHaveBeenCalled();

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_transfer_complete' }) },
      });
    });

    expect(markTransferCompleteMock).toHaveBeenCalledTimes(1);
    expect(onModelUpdateStatus).toHaveBeenLastCalledWith('complete');

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'cleanup_done' }) },
      });
    });

    expect(mlpReadyRef.current).toBe(false);
    expect(resetTransferStateMock).toHaveBeenCalledTimes(1);

    requeueLastModelMock.mockImplementationOnce(() => {
      injectModelMock('initial-model', queuedContext);
      return true;
    });

    act(() => {
      component!.update(
        <MediaPipeGestureDetector
          onGestureDetected={onGestureDetected}
          onError={onError}
          onModelUpdateStatus={onModelUpdateStatus}
          facingMode="environment"
        />,
      );
    });

    webview = component!.root.findByType('mock-webview');

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_ready' }) },
      });
    });

    expect(requeueLastModelMock).toHaveBeenCalledTimes(1);
    expect(injectModelMock).toHaveBeenCalledWith('initial-model', queuedContext);
    expect(logger.info).toHaveBeenCalledWith('Replaying stored MLP model after WebView reload');

    act(() => {
      webview.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'telemetry', event: 'mlp_transfer_complete' }) },
      });
    });

    expect(markTransferCompleteMock).toHaveBeenCalledTimes(2);
    expect(onModelUpdateStatus).toHaveBeenLastCalledWith('complete');
  });

  it('forwards frame capture payloads for downstream handling', () => {
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

