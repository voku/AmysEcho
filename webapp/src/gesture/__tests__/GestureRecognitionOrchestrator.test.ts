import { vi } from 'vitest';
/**
 * Unit tests for the GestureRecognitionOrchestrator
 * Tests the modular gesture recognition system
 */

const mockCameraStart = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCameraStop = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCameraUpdate = vi.fn();
const mockCameraDimensionsChanged = vi.fn().mockReturnValue(false);
const mockCameraReady = vi.fn().mockReturnValue(false);

const mockDisposeResources = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockRecognizeForVideo = vi.fn();
const mockCloseRecognizer = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCreateFromOptions = vi
  .fn<(
    vision: unknown,
    options: Record<string, unknown>
  ) => Promise<{ recognizeForVideo: typeof mockRecognizeForVideo; close: typeof mockCloseRecognizer }>>()
  .mockResolvedValue({ recognizeForVideo: mockRecognizeForVideo, close: mockCloseRecognizer });

const mockFilesetResolver = {
  forVisionTasks: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
};

const mockLoadTasksVision = vi.fn(async () => ({
  FilesetResolver: mockFilesetResolver,
  GestureRecognizer: { createFromOptions: mockCreateFromOptions },
  wasmBase: 'mock-wasm-base',
}));

vi.mock('../core/MediaPipeLoader', () => ({
  __esModule: true,
  loadTasksVision: (...args: any[]) => mockLoadTasksVision(...args),
}));

vi.mock('../core/CameraManager', () => {
  class MockCameraManager {
    startCamera = mockCameraStart;
    stopCamera = mockCameraStop;
    updateVideoDimensions = mockCameraUpdate;
    hasDimensionsChanged = mockCameraDimensionsChanged;
    isVideoReady = mockCameraReady;
  }

  return {
    __esModule: true,
    CameraManager: MockCameraManager,
  };
});

vi.mock('../core/OverlayRenderer', () => {
  class MockOverlayRenderer {
    resizeOverlay = vi.fn();
    clear = vi.fn();
    drawHandLandmarks = vi.fn();
  }
  return {
    __esModule: true,
    OverlayRenderer: MockOverlayRenderer,
  };
});

vi.mock('../utils/ResourceManager', () => {
  class MockResourceManager {
    registerCleanup = vi.fn();
    registerEventListener = vi.fn();
    registerMediaStream = vi.fn();
    registerTimeout = vi.fn();
    registerObserver = vi.fn();
    dispose = mockDisposeResources;
  }

  return {
    __esModule: true,
    ResourceManager: MockResourceManager,
  };
});

vi.mock('../utils/HealthMonitor', () => {
  class MockHealthMonitor {
    recordFrame = vi.fn();
    recordError = vi.fn();
    needsRecovery = vi.fn().mockReturnValue(false);
  }
  return {
    __esModule: true,
    HealthMonitor: MockHealthMonitor,
  };
});

const mockFallbackRecorderStart = vi.fn();
const mockFallbackRecorderStop = vi.fn();
const mockFallbackRecorderCancel = vi.fn();
const mockFallbackGetMimeType = vi.fn(() => 'video/avi');

vi.mock('../utils/FallbackClipRecorder', () => {
  class MockFallbackClipRecorder {
    start = mockFallbackRecorderStart;
    stop = mockFallbackRecorderStop;
    cancel = mockFallbackRecorderCancel;
    getMimeType = mockFallbackGetMimeType;
  }
  return {
    __esModule: true,
    FallbackClipRecorder: MockFallbackClipRecorder,
  };
});

import { GestureRecognitionOrchestrator } from '../core/GestureRecognitionOrchestrator';
import { ErrorRecoveryManager } from '../utils/ErrorRecoveryManager';
import type { MediaPipeGestureResult } from '../types/MediaPipeTypes';
import { messageBatcher } from '../utils/MessageBatcher';
import { MemoryOptimizer } from '../utils/MemoryOptimizer';
import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import * as FrameCaptureManager from '../utils/FrameCaptureManager';

const mockVideo = document.createElement('video');
const mockOverlay = document.createElement('canvas');
let originalMediaRecorder: typeof MediaRecorder | undefined;
let mockMediaRecorderClass: any;

const createMockGestureResults = (overrides: Partial<MediaPipeGestureResult> = {}): MediaPipeGestureResult => ({
  landmarks: [createHandLandmarks()],
  handednesses: [[{ categoryName: 'Left' }]],
  gestures: [[{ categoryName: 'Thumbs_Up', score: 0.92 }]],
  ...overrides,
});

function createHandLandmarks(): Array<{ x: number; y: number; z: number }> {
  return Array.from({ length: 21 }, (_, index) => ({
    x: 0.05 * index,
    y: index < 5 ? 0.1 : 0.2 + index * 0.01,
    z: 0,
  }));
}

describe('GestureRecognitionOrchestrator', () => {
  let orchestrator: GestureRecognitionOrchestrator;
  let queueSpy: vi.SpyInstance;
  let forceFlushSpy: vi.SpyInstance;
  let startMonitoringSpy: vi.SpyInstance;
  let captureSpy: vi.SpyInstance;
  let toggleCaptureSpy: vi.SpyInstance;
  let errorRecoveryManager: ErrorRecoveryManager;

  beforeAll(() => {
    window.ReactNativeWebView = { postMessage: vi.fn() };
    originalMediaRecorder = (window as any).MediaRecorder;
    class MockMediaRecorder {
      static isTypeSupported = vi.fn(() => true);
      state: MediaRecorderState = 'inactive';
      mimeType: string;
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onstop: (() => void) | null = null;
      onstart: ((event: Event) => void) | null = null;
      requestData = vi.fn(() => {
        if (this.ondataavailable) {
          const blob = new Blob(['mock'], { type: this.mimeType });
          this.ondataavailable({ data: blob } as BlobEvent);
        }
      });
      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        this.mimeType = options?.mimeType ?? 'video/webm';
      }
      start = vi.fn(() => {
        this.state = 'recording';
        this.onstart?.(new Event('start'));
      });
      stop = vi.fn(() => {
        this.state = 'inactive';
        this.onstop?.();
      });
    }
    mockMediaRecorderClass = MockMediaRecorder;
    (window as any).MediaRecorder = MockMediaRecorder as any;
  });

  beforeEach(() => {
    queueSpy = vi.spyOn(messageBatcher, 'queueMessage');
    forceFlushSpy = vi.spyOn(messageBatcher, 'forceFlush');
    startMonitoringSpy = vi
      .spyOn(MemoryOptimizer.prototype as any, 'startMemoryMonitoring')
      .mockImplementation(() => {});
    captureSpy = vi.spyOn(FrameCaptureManager, 'getLastCapturedFrame').mockReturnValue(null);
    toggleCaptureSpy = vi.spyOn(FrameCaptureManager, 'setFrameCaptureEnabled');

    (MemoryOptimizer as unknown as { instance?: MemoryOptimizer }).instance = undefined;

    mockCameraStart.mockClear();
    mockCameraStop.mockClear();
    mockCameraUpdate.mockClear();
    mockCameraDimensionsChanged.mockReturnValue(false);
    mockCameraReady.mockReturnValue(false);

    mockDisposeResources.mockClear();
    mockRecognizeForVideo.mockClear();
    mockCloseRecognizer.mockClear();
    mockCreateFromOptions.mockClear().mockResolvedValue({
      recognizeForVideo: mockRecognizeForVideo,
      close: mockCloseRecognizer,
    });
    mockFilesetResolver.forVisionTasks.mockClear().mockResolvedValue({});
    mockLoadTasksVision.mockClear().mockImplementation(async () => ({
      FilesetResolver: mockFilesetResolver,
      GestureRecognizer: { createFromOptions: mockCreateFromOptions },
      wasmBase: 'mock-wasm-base',
    }));

    mockFallbackRecorderStart.mockReset();
    mockFallbackRecorderStop.mockReset();
    mockFallbackRecorderCancel.mockReset();
    mockFallbackGetMimeType.mockReset().mockReturnValue('video/avi');

    errorRecoveryManager = new ErrorRecoveryManager();
    orchestrator = new GestureRecognitionOrchestrator(mockVideo, mockOverlay, {
      errorRecoveryManager,
    });
  });

  afterEach(() => {
    messageBatcher.forceFlush();
    queueSpy.mockRestore();
    forceFlushSpy.mockRestore();
    startMonitoringSpy.mockRestore();
    captureSpy.mockRestore();
    toggleCaptureSpy.mockRestore();
    (MemoryOptimizer as unknown as { instance?: MemoryOptimizer }).instance = undefined;
    (window.ReactNativeWebView!.postMessage as vi.Mock).mockReset();
  });

  afterAll(() => {
    (window as any).MediaRecorder = originalMediaRecorder;
  });

  describe('initialization', () => {
    it('initializes the gesture detector and monitoring components', async () => {
      await expect(orchestrator.initialize()).resolves.toBeUndefined();
      expect(mockLoadTasksVision).toHaveBeenCalled();
      expect(toggleCaptureSpy).toHaveBeenCalledWith(true, 150);
    });

    it('configures the processing pipeline with all steps', () => {
      const pipeline = (orchestrator as any).processingPipeline;
      const steps = ((pipeline as any).processingSteps as any[]).map((step: any) => step.name);

      expect(steps).toEqual([
        'landmark_preprocessing',
        'stability_analysis',
        'gesture_detection',
        'partial_gesture_analysis',
        'emergency_gesture_check',
        'fallback_processing',
        'result_processing',
      ]);
    });

    it('propagates initialization failures from the gesture detector', async () => {
      mockLoadTasksVision.mockRejectedValueOnce(new Error('Hardware not available'));

      await expect(orchestrator.initialize()).rejects.toThrow('Hardware not available');
    });
  });

  describe('camera management', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('starts and stops the detector without duplicating work', async () => {
      await expect(orchestrator.start()).resolves.toBeUndefined();
      await expect(orchestrator.start()).resolves.toBeUndefined();
      await expect(orchestrator.stop()).resolves.toBeUndefined();
      await expect(orchestrator.stop()).resolves.toBeUndefined();

      expect(mockCameraStart).toHaveBeenCalledTimes(1);
      expect(mockCameraStop).toHaveBeenCalledTimes(1);
    });

    it('handles camera failures gracefully without throwing', async () => {
      mockCameraStart.mockRejectedValueOnce(new Error('Camera permission denied'));
      const initialCaptureCalls = toggleCaptureSpy.mock.calls.length;

      await expect(orchestrator.start()).resolves.toBeUndefined();
      expect(mockCameraStart).toHaveBeenCalled();
      expect(toggleCaptureSpy.mock.calls.length).toBe(initialCaptureCalls);
    });
  });

  describe('gesture result processing', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
      await orchestrator.start();
    });

    it('queues gesture payloads with metadata from the real pipeline', async () => {
      const mockResults = createMockGestureResults();

      await (orchestrator as any).handleGestureResults(mockResults, Date.now());

      const gestureCall = queueSpy.mock.calls.find(([payload]) => payload.type === 'gesture');
      expect(gestureCall).toBeDefined();
      expect(gestureCall?.[0]).toEqual(
        expect.objectContaining({
          type: 'gesture',
          gesture: 'thumbs_up',
          confidence: expect.any(Number),
          handednesses: expect.arrayContaining(['Left']),
          thresholds: expect.objectContaining({ fallback: expect.any(Number), mlp: expect.any(Number) }),
        })
      );
      expect(gestureCall?.[1]).toEqual({ flushImmediately: false });
    });

    it('skips processing when performance optimizer declines the frame', async () => {
      const shouldProcessSpy = vi
        .spyOn(PerformanceOptimizer.prototype, 'shouldProcessFrame')
        .mockReturnValue(false);
      const mockResults = createMockGestureResults();

      await (orchestrator as any).handleGestureResults(mockResults, Date.now());

      expect(queueSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'gesture' }), expect.anything());
      shouldProcessSpy.mockRestore();
    });

    it('logs and continues when the processing pipeline throws', async () => {
      const executeSpy = vi
        .spyOn((orchestrator as any).processingPipeline, 'executePipeline')
        .mockRejectedValueOnce(new Error('Processing failed'));
      const mockResults = createMockGestureResults();

      await expect((orchestrator as any).handleGestureResults(mockResults, Date.now())).resolves.toBeUndefined();
      executeSpy.mockRestore();
    });

    it('flushes immediately for emergency detections', async () => {
      const emergencyResults = createMockGestureResults({
        gestures: [[{ categoryName: 'Help', score: 0.6 }]],
      });

      await (orchestrator as any).handleGestureResults(emergencyResults, Date.now());

      const gestureCall = queueSpy.mock.calls.find(([payload]) => payload.type === 'gesture');
      expect(gestureCall?.[1]).toEqual({ flushImmediately: true });
    });

    it('adds frame captures for fallback payloads and flushes immediately', async () => {
      const fallbackResults = createMockGestureResults({ gestures: [[]] as any });
      captureSpy.mockReturnValue('frame-data');
      errorRecoveryManager.activateFallbackMode();

      await (orchestrator as any).handleGestureResults(fallbackResults, Date.now());

      const gestureCall = queueSpy.mock.calls.find(([payload]) => payload.type === 'gesture');
      expect(gestureCall?.[0]).toEqual(expect.objectContaining({ frameCapture: 'frame-data' }));
      expect(gestureCall?.[1]).toEqual({ flushImmediately: true });
    });

    it('streams landmarks with higher temporal resolution when processing is fast', async () => {
      const shouldProcessSpy = vi
        .spyOn(PerformanceOptimizer.prototype, 'shouldProcessFrame')
        .mockReturnValue(true);
      const mockResults = createMockGestureResults({ gestures: [[]] as any });
      queueSpy.mockClear();

      const nowSpy = vi.spyOn(Date, 'now');
      let current = 1000;
      nowSpy.mockImplementation(() => current);

      await (orchestrator as any).handleGestureResults(mockResults, current);
      const firstLandmarkCalls = queueSpy.mock.calls.filter(([payload]) => payload.type === 'landmarks');
      expect(firstLandmarkCalls.length).toBeGreaterThan(0);

      current += 125;
      await (orchestrator as any).handleGestureResults(mockResults, current);
      const secondLandmarkCalls = queueSpy.mock.calls.filter(([payload]) => payload.type === 'landmarks');
      expect(secondLandmarkCalls.length).toBeGreaterThan(1);

      shouldProcessSpy.mockRestore();
      nowSpy.mockRestore();
    });
  });

  describe('fallback clip capture', () => {
    let fallbackOrchestrator: GestureRecognitionOrchestrator;
    let stubDetector: any;

    beforeEach(() => {
      vi.useFakeTimers();
      (window as any).MediaRecorder = undefined;
      const stream = { id: 'mock-stream' } as unknown as MediaStream;
      stubDetector = {
        initialize: vi.fn().mockResolvedValue(undefined),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        cleanup: vi.fn().mockResolvedValue(undefined),
        setResultCallback: vi.fn(),
        getCameraStream: vi.fn(() => stream),
      };
      fallbackOrchestrator = new GestureRecognitionOrchestrator(mockVideo, mockOverlay, {
        createGestureDetector: () => stubDetector,
        errorRecoveryManager,
      });
      mockFallbackRecorderStop.mockResolvedValue({
        base64: 'YmFzZTY0',
        mimeType: 'video/avi',
        durationMs: 900,
        frameCount: 9,
        capturedAt: new Date(0).toISOString(),
      });
      Object.defineProperty(mockVideo, 'videoWidth', { value: 640, configurable: true, writable: true });
      Object.defineProperty(mockVideo, 'videoHeight', { value: 480, configurable: true, writable: true });
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
      (window as any).MediaRecorder = mockMediaRecorderClass as any;
    });

    it('rejects clip capture when video element is not ready', async () => {
      await fallbackOrchestrator.initialize();
      Object.defineProperty(mockVideo, 'videoWidth', { value: 0, configurable: true, writable: true });
      Object.defineProperty(mockVideo, 'videoHeight', { value: 0, configurable: true, writable: true });

      fallbackOrchestrator.startClipCapture('not-ready-clip');

      const clipErrorCall = (window.ReactNativeWebView!.postMessage as vi.Mock).mock.calls.find(([arg]) => {
        if (typeof arg !== 'string') return false;
        try {
          const p = JSON.parse(arg);
          return p.type === 'clip_error' && p.reason === 'video_not_ready';
        } catch {
          return false;
        }
      });
      expect(clipErrorCall).toBeDefined();
      const payload = JSON.parse(clipErrorCall![0]);
      expect(payload).toEqual(
        expect.objectContaining({
          type: 'clip_error',
          id: 'not-ready-clip',
          reason: 'video_not_ready',
        }),
      );
    });

    it('falls back to the custom recorder when MediaRecorder is unavailable', async () => {
      await fallbackOrchestrator.initialize();
      const state = {
        mode: 'fallback' as const,
        id: 'fallback-clip',
        recorder: { cancel: vi.fn(), getMimeType: () => 'video/avi' },
        startedAt: Date.now(),
        timeoutHandle: null,
        aborted: false,
      };
      (fallbackOrchestrator as any).clipCaptureState = state;

      (fallbackOrchestrator as any).handleFallbackClipStop(state, {
        base64: 'YmFzZTY0',
        mimeType: 'video/avi',
        durationMs: 900,
        frameCount: 9,
        capturedAt: new Date(0).toISOString(),
      });

      const clipReadyCall = (window.ReactNativeWebView!.postMessage as vi.Mock).mock.calls.find(([arg]) =>
        typeof arg === 'string' && arg.includes('"clip_ready"'),
      );
      expect(clipReadyCall).toBeDefined();
      const payload = JSON.parse(clipReadyCall![0]);
      expect(payload).toEqual(
        expect.objectContaining({
          type: 'clip_ready',
          id: 'fallback-clip',
          mimeType: 'video/avi',
        }),
      );
    });
  });

  describe('clip delivery failures', () => {
    it('emits clip_capture_failed when posting clip_ready throws', async () => {
      const postMessageMock = window.ReactNativeWebView!.postMessage as vi.Mock;
      const capturedMessages: Array<Record<string, unknown>> = [];
      postMessageMock
        .mockImplementationOnce(() => {
          throw new Error('post failed');
        })
        .mockImplementation((message: string) => {
          capturedMessages.push(JSON.parse(message));
        });

      await orchestrator.initialize();

      (orchestrator as any).postClipReady({
        id: 'clip-failure',
        base64: 'YmFzZTY0',
        mimeType: 'video/webm',
        durationMs: 1000,
        frameCount: 30,
        capturedAt: new Date(0).toISOString(),
      });

      expect(capturedMessages).toEqual([
        expect.objectContaining({
          type: 'clip_error',
          id: 'clip-failure',
          reason: 'clip_capture_failed',
          details: {
            message: 'post failed',
            name: 'Error',
          },
        }),
        expect.objectContaining({
          type: 'telemetry',
          event: 'clip_error',
          requestId: 'clip-failure',
          data: expect.objectContaining({
            reason: 'clip_capture_failed',
            details: {
              message: 'post failed',
              name: 'Error',
            },
          }),
          timestamp: expect.any(Number),
        }),
      ]);
    });
  });

  describe('status reporting', () => {
    it('reports initialization and runtime state transitions', async () => {
      let status = orchestrator.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.running).toBe(false);

      await orchestrator.initialize();
      status = orchestrator.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.running).toBe(false);

      await orchestrator.start();
      status = orchestrator.getStatus();
      expect(status.running).toBe(true);
      expect(status.performance).toBeDefined();
      expect(status.memory).toBeDefined();
      expect(status.health).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('flushes pending messages, disables capture and performs memory cleanup', async () => {
      const cleanupSpy = vi.spyOn((orchestrator as any).memoryOptimizer, 'performCleanup');

      await orchestrator.initialize();
      await orchestrator.start();

      await expect(orchestrator.cleanup()).resolves.toBeUndefined();

      expect(forceFlushSpy).toHaveBeenCalled();
      expect(toggleCaptureSpy).toHaveBeenCalledWith(false);
      expect(cleanupSpy).toHaveBeenCalled();

      cleanupSpy.mockRestore();
    });

    it('is safe to call without prior initialization', async () => {
      await expect(orchestrator.cleanup()).resolves.toBeUndefined();
    });
  });
});
