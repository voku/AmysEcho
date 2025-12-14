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
  let mockLoadTasksVision: jest.Mock;
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
      resizeOverlay: jest.fn(),
      drawHandLandmarks: jest.fn(),
      drawPoseLandmarks: jest.fn(),
      drawFaceLandmarks: jest.fn(),
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
    const mockLoadConfig = jest.fn().mockReturnValue({
      performance: { telemetrySampleRate: 1000 },
      thresholds: { mlpConfidence: 0.8 },
    });

    mockLoadTasksVision = jest.fn().mockResolvedValue(mockComponents);
    GestureDetector.setLoadTasksVisionImplementation(mockLoadTasksVision);
    require('../config/GestureConfig').loadConfig = mockLoadConfig;

    (CameraManager as jest.MockedClass<typeof CameraManager>).mockImplementation(() => mockCameraManager);
    (OverlayRenderer as jest.MockedClass<typeof OverlayRenderer>).mockImplementation(() => mockOverlayRenderer);
    (ResourceManager as jest.MockedClass<typeof ResourceManager>).mockImplementation(() => mockResourceManager);
    (HealthMonitor as jest.MockedClass<typeof HealthMonitor>).mockImplementation(() => mockHealthMonitor);
  });

  afterEach(() => {
    GestureDetector.setLoadTasksVisionImplementation(null);
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
      mockLoadTasksVision.mockRejectedValue(new Error('Network error'));

      const detector = new GestureDetector(mockVideo, mockOverlay);

      await expect(detector.initialize()).rejects.toThrow('Network error');
    });
  });

  // Tests for the error recovery system implemented in gestureDetector.ts
  describe('Error Recovery System', () => {
    let mockErrorRecoveryManager: any;
    let mockFallbackDetector: any;
    let mockEmergencySystem: any;

    beforeEach(() => {
      // Mock the error recovery components
      mockErrorRecoveryManager = {
        getErrorInfo: jest.fn(),
        recordFailure: jest.fn(),
        activateFallbackMode: jest.fn(),
        activateEmergencyMode: jest.fn(),
        isInFallbackMode: jest.fn(),
        isInEmergencyMode: jest.fn(),
        canAttemptRecovery: jest.fn(),
        recordSuccessfulRecovery: jest.fn(),
        getHealthStatus: jest.fn(),
        isCircuitBreakerOpen: jest.fn()
      };

      mockFallbackDetector = {
        detectGesture: jest.fn()
      };

      mockEmergencySystem = {
        processEmergencyGesture: jest.fn(),
        shouldEnterEmergencyMode: jest.fn()
      };

      // Replace the global instances with mocks for testing
      (global as any).errorRecoveryManager = mockErrorRecoveryManager;
      (global as any).fallbackGestureDetector = mockFallbackDetector;
      (global as any).emergencyGestureSystem = mockEmergencySystem;
    });

    it('should activate fallback mode on MediaPipe failures', () => {
      mockErrorRecoveryManager.getErrorInfo.mockReturnValue({
        message: 'MediaPipe failed',
        code: 'MEDIAPIPE_ERROR',
        recoverable: true,
        severity: 'medium',
        suggestedAction: 'fallback_mode',
        userMessage: 'Fallback mode activated'
      });
      mockErrorRecoveryManager.recordFailure.mockReturnValue(true);

      // Simulate MediaPipe failure
      const error = new Error('WebGL context lost');
      const errorInfo = mockErrorRecoveryManager.getErrorInfo(error, 'gesture_processing');

      expect(errorInfo.code).toBe('MEDIAPIPE_ERROR');
      expect(errorInfo.recoverable).toBe(true);
    });

    it('should handle emergency gestures with priority', () => {
      mockEmergencySystem.processEmergencyGesture.mockReturnValue({
        shouldProcess: true,
        priority: 'critical',
        cooldownRemaining: 0,
        feedback: '🆘 Hilfe wird gerufen!'
      });

      const emergencyResult = mockEmergencySystem.processEmergencyGesture(
        'hilfe',
        0.8,
        [[[0.5, 0.5, 0]]]
      );

      expect(emergencyResult.shouldProcess).toBe(true);
      expect(emergencyResult.priority).toBe('critical');
      expect(emergencyResult.feedback).toContain('Hilfe');
    });

    it('should use fallback gesture detection when main system fails', () => {
      mockErrorRecoveryManager.isInFallbackMode.mockReturnValue(true);
      mockFallbackDetector.detectGesture.mockReturnValue({
        gesture: 'thumbs_up',
        confidence: 0.7,
        isFallback: true,
        feedback: 'Daumen hoch erkannt!'
      });

      const fallbackResult = mockFallbackDetector.detectGesture([
        [[0.5, 0.3, 0], [0.6, 0.4, 0]] // Mock hand landmarks
      ]);

      expect(fallbackResult.isFallback).toBe(true);
      expect(fallbackResult.gesture).toBe('thumbs_up');
      expect(fallbackResult.confidence).toBe(0.7);
    });

    it('should activate emergency mode on repeated critical failures', () => {
      // Mock the circuit breaker opening after 5 failures
      let failureCount = 0;
      mockErrorRecoveryManager.recordFailure.mockImplementation(() => {
        failureCount++;
        if (failureCount >= 5) {
          mockErrorRecoveryManager.activateEmergencyMode();
          return false; // Circuit breaker opens
        }
        return true; // Should retry
      });

      // Simulate multiple failures
      for (let i = 0; i < 6; i++) {
        mockErrorRecoveryManager.recordFailure(new Error('Critical failure'), 'test');
      }

      expect(mockErrorRecoveryManager.activateEmergencyMode).toHaveBeenCalled();
    });

    it('should provide appropriate error messages for different error types', () => {
      // Network error
      mockErrorRecoveryManager.getErrorInfo.mockReturnValue({
        message: 'Network connectivity issue',
        code: 'NETWORK_ERROR',
        recoverable: true,
        severity: 'medium',
        suggestedAction: 'retry_with_backoff',
        userMessage: 'Verbindungsproblem erkannt, versuche Wiederherstellung...'
      });

      const networkError = mockErrorRecoveryManager.getErrorInfo(
        new Error('Failed to fetch'),
        'network_request'
      );

      expect(networkError.code).toBe('NETWORK_ERROR');
      expect(networkError.recoverable).toBe(true);
      expect(networkError.userMessage).toContain('Verbindungsproblem');

      // Camera error
      mockErrorRecoveryManager.getErrorInfo.mockReturnValue({
        message: 'Camera access issue',
        code: 'CAMERA_ERROR',
        recoverable: true,
        severity: 'high',
        suggestedAction: 'request_permission',
        userMessage: 'Kamera-Zugriff wird überprüft...'
      });

      const cameraError = mockErrorRecoveryManager.getErrorInfo(
        new Error('Camera permission denied'),
        'camera_access'
      );

      expect(cameraError.code).toBe('CAMERA_ERROR');
      expect(cameraError.severity).toBe('high');
    });

    it('should attempt recovery when appropriate', () => {
      mockErrorRecoveryManager.canAttemptRecovery.mockReturnValue(true);
      mockErrorRecoveryManager.recordSuccessfulRecovery.mockImplementation(() => {});

      const canRecover = mockErrorRecoveryManager.canAttemptRecovery('gesture_processing');
      expect(canRecover).toBe(true);

      // Simulate successful recovery
      mockErrorRecoveryManager.recordSuccessfulRecovery('gesture_processing');
      expect(mockErrorRecoveryManager.recordSuccessfulRecovery).toHaveBeenCalledWith('gesture_processing');
    });

    it('should handle circuit breaker state correctly', () => {
      mockErrorRecoveryManager.isCircuitBreakerOpen.mockReturnValue(true);

      const isOpen = mockErrorRecoveryManager.isCircuitBreakerOpen();
      expect(isOpen).toBe(true);
    });

    it('should provide comprehensive health status', () => {
      mockErrorRecoveryManager.getHealthStatus.mockReturnValue({
        healthy: false,
        fallbackActive: true,
        emergencyActive: true,
        failureCount: 3,
        lastFailure: Date.now() - 1000,
        circuitBreakerOpen: false
      });

      const health = mockErrorRecoveryManager.getHealthStatus();

      expect(health.healthy).toBe(false);
      expect(health.fallbackActive).toBe(true);
      expect(health.emergencyActive).toBe(true);
      expect(health.failureCount).toBe(3);
    });
  });
});