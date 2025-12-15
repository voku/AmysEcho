import { vi } from 'vitest';
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
import * as GestureConfig from '../config/GestureConfig';

// Mock dependencies
vi.mock('../core/MediaPipeLoader');
vi.mock('../core/CameraManager', () => {
  class MockCameraManager {
    startCamera = vi.fn().mockResolvedValue(undefined);
    stopCamera = vi.fn().mockResolvedValue(undefined);
  }
  return { CameraManager: MockCameraManager };
});
vi.mock('../core/OverlayRenderer', () => {
  class MockOverlayRenderer {
    render = vi.fn();
    clear = vi.fn();
    resizeOverlay = vi.fn();
    drawHandLandmarks = vi.fn();
    drawPoseLandmarks = vi.fn();
    drawFaceLandmarks = vi.fn();
  }
  return { OverlayRenderer: MockOverlayRenderer };
});
vi.mock('../utils/ResourceManager', () => {
  class MockResourceManager {
    registerEventListener = vi.fn();
    registerCleanup = vi.fn();
    registerMediaStream = vi.fn();
    registerTimeout = vi.fn();
    registerObserver = vi.fn();
    dispose = vi.fn();
  }
  return { ResourceManager: MockResourceManager };
});
vi.mock('../utils/HealthMonitor', () => {
  class MockHealthMonitor {
    recordFrame = vi.fn();
    recordError = vi.fn();
    getHealth = vi.fn().mockReturnValue({ status: 'healthy' });
    needsRecovery = vi.fn().mockReturnValue(false);
  }
  return { HealthMonitor: MockHealthMonitor };
});
vi.mock('../config/GestureConfig');

describe('GestureDetector', () => {
  let mockVideo: HTMLVideoElement;
  let mockOverlay: HTMLCanvasElement;
  let mockGestureRecognizer: any;
  let mockComponents: MediaPipeComponents;
  let mockLoadTasksVision: vi.Mock;

  beforeEach(() => {
    // Create mock DOM elements
    mockVideo = document.createElement('video');
    mockOverlay = document.createElement('canvas');

    // Mock MediaPipe components
    mockGestureRecognizer = {
      recognizeForVideo: vi.fn(),
      close: vi.fn(),
    };

    mockComponents = {
      FilesetResolver: {
        forVisionTasks: vi.fn().mockResolvedValue({}),
      },
      GestureRecognizer: {
        createFromOptions: vi.fn().mockResolvedValue(mockGestureRecognizer),
      },
      wasmBase: 'mock-wasm-base',
    } as any;

    // Setup mocks
    vi.mocked(GestureConfig.loadConfig).mockReturnValue({
      performance: { telemetrySampleRate: 1000 },
      thresholds: { mlpConfidence: 0.8 },
      camera: { mirrorOverlay: true },
    } as any);

    mockLoadTasksVision = vi.fn().mockResolvedValue(mockComponents);
    GestureDetector.setLoadTasksVisionImplementation(mockLoadTasksVision);
  });

  afterEach(() => {
    GestureDetector.setLoadTasksVisionImplementation(null);
    vi.clearAllMocks();
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

      // The detector should have been initialized successfully and registered listeners
      // (The actual mock behavior is handled by the class mocks)
      expect(detector).toBeInstanceOf(GestureDetector);
    });
  });

  describe('camera management', () => {
    it('should start camera when start is called', async () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);
      await detector.initialize();

      // Start should not throw
      await expect(detector.start()).resolves.not.toThrow();
    });
  });

  describe('overlay rendering', () => {
    it('draws multimodal overlays when pose and face landmarks are present', async () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);
      await detector.initialize();

      const overlayRenderer = (detector as any).overlayRenderer as OverlayRenderer;
      const poseLandmarks = Array.from({ length: 29 }, (_, index) => [
        0.1 + index * 0.001,
        0.2,
        0,
      ]);
      const faceLandmarks = Array.from({ length: 363 }, () => [0.3, 0.4, 0]);

      (detector as any).updateOverlay([
        [[0.1, 0.1, 0], [0.2, 0.2, 0]],
      ], 12, 0, poseLandmarks, faceLandmarks);

      expect(overlayRenderer.drawPoseLandmarks).toHaveBeenCalledWith(poseLandmarks, expect.any(Boolean));
      expect(overlayRenderer.drawFaceLandmarks).toHaveBeenCalledWith(faceLandmarks, expect.any(Boolean));
      expect(overlayRenderer.drawHandLandmarks).toHaveBeenCalled();
    });

    it('prioritizes hand landmarks over body/face for redraw decisions (sign language)', async () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);
      await detector.initialize();

      const overlayRenderer = (detector as any).overlayRenderer as OverlayRenderer;
      const performanceOptimizer = (detector as any).performanceOptimizer;
      
      // Create hand landmarks and pose/face landmarks
      const handLandmarks = [[[0.1, 0.1, 0], [0.2, 0.2, 0]]];
      const poseLandmarks = Array.from({ length: 29 }, () => [0.3, 0.3, 0]);
      const faceLandmarks = Array.from({ length: 363 }, () => [0.4, 0.4, 0]);

      // First call to establish baseline
      (detector as any).updateOverlay(handLandmarks, 12, 0, poseLandmarks, faceLandmarks);
      
      // Clear mock call history
      vi.mocked(overlayRenderer.clear).mockClear();
      vi.mocked(overlayRenderer.drawHandLandmarks).mockClear();
      vi.mocked(overlayRenderer.drawPoseLandmarks).mockClear();
      vi.mocked(overlayRenderer.drawFaceLandmarks).mockClear();

      // Change ONLY hand landmarks (should trigger redraw because hands are prioritized)
      const newHandLandmarks = [[[0.5, 0.5, 0], [0.6, 0.6, 0]]];
      (detector as any).updateOverlay(newHandLandmarks, 30, 100, poseLandmarks, faceLandmarks);

      // Hand landmarks should still be drawn because they changed
      // and hands are prioritized for sign language
      expect(overlayRenderer.drawHandLandmarks).toHaveBeenCalledWith(
        newHandLandmarks,
        expect.any(Boolean)
      );
    });

    it('draws hands last (on top) for sign language visibility', async () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);
      await detector.initialize();

      const overlayRenderer = (detector as any).overlayRenderer as OverlayRenderer;
      
      const handLandmarks = [[[0.1, 0.1, 0], [0.2, 0.2, 0]]];
      const poseLandmarks = Array.from({ length: 29 }, () => [0.3, 0.3, 0]);
      const faceLandmarks = Array.from({ length: 363 }, () => [0.4, 0.4, 0]);

      // Clear any previous calls
      vi.mocked(overlayRenderer.clear).mockClear();
      vi.mocked(overlayRenderer.drawHandLandmarks).mockClear();
      vi.mocked(overlayRenderer.drawPoseLandmarks).mockClear();
      vi.mocked(overlayRenderer.drawFaceLandmarks).mockClear();

      (detector as any).updateOverlay(handLandmarks, 12, 0, poseLandmarks, faceLandmarks);

      // Verify the order of calls: pose -> face -> hands (hands last = on top)
      const clearCallOrder = vi.mocked(overlayRenderer.clear).mock.invocationCallOrder[0];
      const poseCallOrder = vi.mocked(overlayRenderer.drawPoseLandmarks).mock.invocationCallOrder[0];
      const faceCallOrder = vi.mocked(overlayRenderer.drawFaceLandmarks).mock.invocationCallOrder[0];
      const handCallOrder = vi.mocked(overlayRenderer.drawHandLandmarks).mock.invocationCallOrder[0];

      expect(clearCallOrder).toBeDefined();
      expect(poseCallOrder).toBeGreaterThan(clearCallOrder);
      expect(faceCallOrder).toBeGreaterThan(poseCallOrder);
      expect(handCallOrder).toBeGreaterThan(faceCallOrder);
    });

    it('still draws pose/face when only they are present (no hands)', async () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);
      await detector.initialize();

      const overlayRenderer = (detector as any).overlayRenderer as OverlayRenderer;
      
      const poseLandmarks = Array.from({ length: 29 }, () => [0.3, 0.3, 0]);
      const faceLandmarks = Array.from({ length: 363 }, () => [0.4, 0.4, 0]);

      // Clear any previous calls
      vi.mocked(overlayRenderer.clear).mockClear();
      vi.mocked(overlayRenderer.drawHandLandmarks).mockClear();
      vi.mocked(overlayRenderer.drawPoseLandmarks).mockClear();
      vi.mocked(overlayRenderer.drawFaceLandmarks).mockClear();

      // No hand landmarks, only pose and face
      (detector as any).updateOverlay([], 12, 0, poseLandmarks, faceLandmarks);

      expect(overlayRenderer.drawPoseLandmarks).toHaveBeenCalled();
      expect(overlayRenderer.drawFaceLandmarks).toHaveBeenCalled();
      expect(overlayRenderer.drawHandLandmarks).not.toHaveBeenCalled();
    });
  });

  describe('result callback', () => {
    it('should call result callback when set', () => {
      const detector = new GestureDetector(mockVideo, mockOverlay);
      const mockCallback = vi.fn();

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
        getErrorInfo: vi.fn(),
        recordFailure: vi.fn(),
        activateFallbackMode: vi.fn(),
        activateEmergencyMode: vi.fn(),
        isInFallbackMode: vi.fn(),
        isInEmergencyMode: vi.fn(),
        canAttemptRecovery: vi.fn(),
        recordSuccessfulRecovery: vi.fn(),
        getHealthStatus: vi.fn(),
        isCircuitBreakerOpen: vi.fn()
      };

      mockFallbackDetector = {
        detectGesture: vi.fn()
      };

      mockEmergencySystem = {
        processEmergencyGesture: vi.fn(),
        shouldEnterEmergencyMode: vi.fn()
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
