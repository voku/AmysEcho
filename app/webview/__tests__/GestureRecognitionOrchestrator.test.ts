/**
 * Unit tests for the GestureRecognitionOrchestrator
 * Tests the modular gesture recognition system
 */

const mockCameraStart = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCameraStop = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCameraUpdate = jest.fn();
const mockCameraDimensionsChanged = jest.fn().mockReturnValue(false);
const mockCameraReady = jest.fn().mockReturnValue(false);

const mockDisposeResources = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockRecognizeForVideo = jest.fn();
const mockCloseRecognizer = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCreateFromOptions = jest
  .fn<(
    vision: unknown,
    options: Record<string, unknown>
  ) => Promise<{ recognizeForVideo: typeof mockRecognizeForVideo; close: typeof mockCloseRecognizer }>>()
  .mockResolvedValue({ recognizeForVideo: mockRecognizeForVideo, close: mockCloseRecognizer });

const mockFilesetResolver = {
  forVisionTasks: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
};

const mockLoadTasksVision = jest.fn(async () => ({
  FilesetResolver: mockFilesetResolver,
  GestureRecognizer: { createFromOptions: mockCreateFromOptions },
  wasmBase: 'mock-wasm-base',
}));

jest.mock('../core/MediaPipeLoader', () => ({
  __esModule: true,
  loadTasksVision: (...args: any[]) => mockLoadTasksVision(...args),
}));

jest.mock('../core/CameraManager', () => {
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

jest.mock('../core/OverlayRenderer', () => ({
  __esModule: true,
  OverlayRenderer: jest.fn().mockImplementation(() => ({
    resizeOverlay: jest.fn(),
    clear: jest.fn(),
    drawHandLandmarks: jest.fn(),
  })),
}));

jest.mock('../utils/ResourceManager', () => {
  class MockResourceManager {
    registerCleanup = jest.fn();
    registerEventListener = jest.fn();
    registerMediaStream = jest.fn();
    registerTimeout = jest.fn();
    registerObserver = jest.fn();
    dispose = mockDisposeResources;
  }

  return {
    __esModule: true,
    ResourceManager: MockResourceManager,
  };
});

jest.mock('../utils/HealthMonitor', () => ({
  __esModule: true,
  HealthMonitor: jest.fn().mockImplementation(() => ({
    recordFrame: jest.fn(),
    recordError: jest.fn(),
    needsRecovery: jest.fn().mockReturnValue(false),
  })),
}));

import { GestureRecognitionOrchestrator } from '../core/GestureRecognitionOrchestrator';
import { ErrorRecoveryManager } from '../utils/ErrorRecoveryManager';
import type { MediaPipeGestureResult } from '../types/MediaPipeTypes';
import { messageBatcher } from '../utils/MessageBatcher';
import { MemoryOptimizer } from '../utils/MemoryOptimizer';
import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import * as FrameCaptureManager from '../utils/FrameCaptureManager';
import { GestureSizeNormalizer, PartialGestureDetector } from '../gestureProcessing';

const mockVideo = document.createElement('video');
const mockOverlay = document.createElement('canvas');

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
  let queueSpy: jest.SpyInstance;
  let forceFlushSpy: jest.SpyInstance;
  let startMonitoringSpy: jest.SpyInstance;
  let captureSpy: jest.SpyInstance;
  let toggleCaptureSpy: jest.SpyInstance;
  let errorRecoveryManager: ErrorRecoveryManager;
  let toleranceSpy: jest.SpyInstance;
  let partialThresholdSpy: jest.SpyInstance;

  beforeAll(() => {
    window.ReactNativeWebView = { postMessage: jest.fn() };
  });

  beforeEach(() => {
    queueSpy = jest.spyOn(messageBatcher, 'queueMessage');
    forceFlushSpy = jest.spyOn(messageBatcher, 'forceFlush');
    startMonitoringSpy = jest
      .spyOn(MemoryOptimizer.prototype as any, 'startMemoryMonitoring')
      .mockImplementation(() => {});
    captureSpy = jest.spyOn(FrameCaptureManager, 'getLastCapturedFrame').mockReturnValue(null);
    toggleCaptureSpy = jest.spyOn(FrameCaptureManager, 'setFrameCaptureEnabled');
    toleranceSpy = jest.spyOn(GestureSizeNormalizer.prototype, 'setTolerance');
    partialThresholdSpy = jest.spyOn(PartialGestureDetector.prototype, 'setThreshold');

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

    (window as any).__gestureSizeTolerance = 0.45;

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
    toleranceSpy.mockRestore();
    partialThresholdSpy.mockRestore();
    (MemoryOptimizer as unknown as { instance?: MemoryOptimizer }).instance = undefined;
    (window.ReactNativeWebView!.postMessage as jest.Mock).mockReset();
    delete (window as any).__gestureSizeTolerance;
  });

  describe('initialization', () => {
    it('initializes the gesture detector and monitoring components', async () => {
      await expect(orchestrator.initialize()).resolves.toBeUndefined();
      expect(mockLoadTasksVision).toHaveBeenCalled();
      expect(toggleCaptureSpy).toHaveBeenCalledWith(true);
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

    it('applies gesture size tolerance from window configuration', () => {
      expect(toleranceSpy).toHaveBeenCalledWith(0.45);
      expect((orchestrator as any).config.gestures.sizeTolerance).toBe(0.45);
    });

    it('applies the partial gesture threshold from configuration defaults', () => {
      expect(partialThresholdSpy).toHaveBeenCalledWith(0.6);
      expect((orchestrator as any).config.gestures.partialThreshold).toBe(0.6);
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
      const shouldProcessSpy = jest
        .spyOn(PerformanceOptimizer.prototype, 'shouldProcessFrame')
        .mockReturnValue(false);
      const mockResults = createMockGestureResults();

      await (orchestrator as any).handleGestureResults(mockResults, Date.now());

      expect(queueSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'gesture' }), expect.anything());
      shouldProcessSpy.mockRestore();
    });

    it('logs and continues when the processing pipeline throws', async () => {
      const executeSpy = jest
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
  });

  describe('gesture size tolerance updates', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('updates the tolerance at runtime', () => {
      toleranceSpy.mockClear();

      orchestrator.setGestureSizeTolerance(0.6);

      expect(toleranceSpy).toHaveBeenCalledWith(0.6);
      expect((orchestrator as any).config.gestures.sizeTolerance).toBe(0.6);
    });

    it('keeps the previous tolerance when provided value is invalid', () => {
      toleranceSpy.mockClear();
      orchestrator.setGestureSizeTolerance(0.5);
      toleranceSpy.mockClear();

      orchestrator.setGestureSizeTolerance(Number.NaN as any);

      expect(toleranceSpy).toHaveBeenCalledWith(0.5);
      expect((orchestrator as any).config.gestures.sizeTolerance).toBe(0.5);
    });

    it('supports legacy update method names exposed to the webview', () => {
      toleranceSpy.mockClear();

      orchestrator.updateGestureSizeTolerance(0.55);
      orchestrator.setGestureTolerance(0.4);

      expect(toleranceSpy).toHaveBeenNthCalledWith(1, 0.55);
      expect(toleranceSpy).toHaveBeenNthCalledWith(2, 0.4);
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
      const cleanupSpy = jest.spyOn((orchestrator as any).memoryOptimizer, 'performCleanup');

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
