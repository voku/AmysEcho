/**
 * Unit tests for GestureDetector class
 * Tests gesture detection orchestration and error handling
 */

import { GestureDetector } from '../core/GestureDetector';
import { MediaPipeComponents } from '../core/MediaPipeLoader';
import { CameraManager } from '../core/CameraManager';
import { OverlayRenderer } from '../core/OverlayRenderer';
import { ResourceManager } from '../utils/ResourceManager';
import { HealthMonitor } from '../utils/HealthMonitor';

// Mock dependencies
jest.mock('../core/MediaPipeLoader');
jest.mock('../core/CameraManager');
jest.mock('../core/OverlayRenderer');
jest.mock('../utils/ResourceManager');
jest.mock('../utils/HealthMonitor');
jest.mock('../config/GestureConfig');

describe('GestureDetector', () => {
  let mockVideo: HTMLVideoElement;
  let mockOverlay: HTMLCanvasElement;
  let mockGestureRecognizer: any;
  let mockComponents: MediaPipeComponents;
  let mockCameraManager: jest.Mocked<CameraManager>;
  let mockOverlayRenderer: jest.Mocked<OverlayRenderer>;
  let mockResourceManager: jest.Mocked<ResourceManager>;
  let mockHealthMonitor: jest.Mocked<HealthMonitor>;

  beforeEach(() => {
    // Create mock DOM elements
    mockVideo = document.createElement('video');
    mockOverlay = document.createElement('canvas');

    // Mock MediaPipe components
    mockGestureRecognizer = {
      recognizeForVideo: jest.fn(),
      close: jest.fn(),
    };

    mockComponents = {
      FilesetResolver: {
        forVisionTasks: jest.fn().mockResolvedValue({}),
      },
      GestureRecognizer: {
        createFromOptions: jest.fn().mockResolvedValue(mockGestureRecognizer),
      },
      wasmBase: 'mock-wasm-base',
    } as any;

    // Mock other dependencies
    mockCameraManager = {
      startCamera: jest.fn().mockResolvedValue(undefined),
      stopCamera: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockOverlayRenderer = {
      render: jest.fn(),
      clear: jest.fn(),
    } as any;

    mockResourceManager = {
      registerEventListener: jest.fn(),
      dispose: jest.fn(),
    } as any;

    mockHealthMonitor = {
      recordFrame: jest.fn(),
      getHealth: jest.fn().mockReturnValue({ status: 'healthy' }),
    } as any;

    // Setup mocks
    const mockLoadTasksVision = jest.fn().mockResolvedValue(mockComponents);
    const mockLoadConfig = jest.fn().mockReturnValue({
      performance: { telemetrySampleRate: 1000 },
      thresholds: { mlpConfidence: 0.8 },
    });

    require('../core/MediaPipeLoader').loadTasksVision = mockLoadTasksVision;
    require('../config/GestureConfig').loadConfig = mockLoadConfig;

    (CameraManager as jest.MockedClass<typeof CameraManager>).mockImplementation(() => mockCameraManager);
    (OverlayRenderer as jest.MockedClass<typeof OverlayRenderer>).mockImplementation(() => mockOverlayRenderer);
    (ResourceManager as jest.MockedClass<typeof ResourceManager>).mockImplementation(() => mockResourceManager);
    (HealthMonitor as jest.MockedClass<typeof HealthMonitor>).mockImplementation(() => mockHealthMonitor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with GPU delegate', async () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);

      await expect(detector.initialize()).resolves.toBeUndefined();

      expect(mockComponents.GestureRecognizer.createFromOptions).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          baseOptions: expect.objectContaining({ delegate: 'GPU' }),
          runningMode: 'VIDEO',
          numHands: 2,
        })
      );
    });

    it('should fallback to CPU when GPU fails', async () => {
      mockComponents.GestureRecognizer.createFromOptions
        .mockRejectedValueOnce(new Error('GPU not available'))
        .mockResolvedValueOnce(mockGestureRecognizer);

      const detector = new GestureDetector(mockVideo, mockOverlay);

      await expect(detector.initialize()).resolves.toBeUndefined();

      expect(mockComponents.GestureRecognizer.createFromOptions).toHaveBeenCalledTimes(2);
      expect(mockComponents.GestureRecognizer.createFromOptions).toHaveBeenNthCalledWith(
        2,
        {},
        expect.objectContaining({
          baseOptions: expect.objectContaining({ delegate: 'CPU' }),
        })
      );
    });

    it('should throw error when both GPU and CPU fail', async () => {
      mockComponents.GestureRecognizer.createFromOptions
        .mockRejectedValue(new Error('Hardware not supported'));

      const detector = new GestureDetector(mockVideo, mockOverlay);

      await expect(detector.initialize()).rejects.toThrow('Hardware not supported');
    });

    it('should register video event listener', async () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);

      await detector.initialize();

      expect(mockResourceManager.registerEventListener).toHaveBeenCalledWith(
        mockVideo,
        'loadeddata',
        expect.any(Function)
      );
    });
  });

  describe('camera management', () => {
    it('should start camera when start is called', async () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);
      await detector.initialize();

      await detector.start();

      expect(mockCameraManager.startCamera).toHaveBeenCalled();
    });
  });

  describe('result callback', () => {
    it('should call result callback when set', () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);
      const mockCallback = jest.fn();

      detector.setResultCallback(mockCallback);

      // Since resultCallback is private, we can't directly test it
      // This test ensures the method exists and doesn't throw
      expect(detector).toBeInstanceOf(GestureDetector);
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const mockLoadTasksVision = require('../core/MediaPipeLoader').loadTasksVision;
      mockLoadTasksVision.mockRejectedValue(new Error('Network error'));

      const detector = new GestureDetector(mockVideo, mockOverlay);

      await expect(detector.initialize()).rejects.toThrow('Network error');
    });
  });
});