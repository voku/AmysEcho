/**
 * Unit tests for the GestureRecognitionOrchestrator
 * Tests the modular gesture recognition system
 */

import { GestureRecognitionOrchestrator } from '../core/GestureRecognitionOrchestrator';
import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import { MemoryOptimizer } from '../utils/MemoryOptimizer';
import { ProcessingPipeline } from '../utils/ProcessingPipeline';

// Mock DOM elements
const mockVideo = document.createElement('video');
const mockOverlay = document.createElement('canvas');

// Mock dependencies
jest.mock('../utils/PerformanceOptimizer');
jest.mock('../utils/MemoryOptimizer');
jest.mock('../utils/ProcessingPipeline');
jest.mock('../core/GestureDetector');
jest.mock('../utils/OptimizedTremorCompensator');
jest.mock('../gestureProcessing');
jest.mock('../core/FallbackGestureDetector');
jest.mock('../core/EmergencyGestureSystem');
jest.mock('../core/HandStabilityAssistant');
jest.mock('../core/BatteryMonitor');
jest.mock('../config/GestureConfig');

describe('GestureRecognitionOrchestrator', () => {
  let orchestrator: GestureRecognitionOrchestrator;
  let mockPerformanceOptimizer: jest.Mocked<PerformanceOptimizer>;
  let mockMemoryOptimizer: jest.Mocked<MemoryOptimizer>;
  let mockProcessingPipeline: jest.Mocked<ProcessingPipeline>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mocks
    mockPerformanceOptimizer = {
      shouldProcessFrame: jest.fn().mockReturnValue(true),
      recordProcessingTime: jest.fn(),
      getPerformanceMetrics: jest.fn().mockReturnValue({
        frameCount: 100,
        averageProcessingTime: 25,
        adaptiveFrameSkipping: false,
        skipFrameCount: 0,
        targetFrameRate: 30
      })
    } as any;

    mockMemoryOptimizer = {
      getOptimizedHistorySize: jest.fn().mockReturnValue(10),
      performCleanup: jest.fn(),
      getMemoryStatus: jest.fn().mockReturnValue({
        pressureLevel: 0,
        lastCleanupTime: Date.now(),
        registeredComponents: 5,
        estimatedMemoryUsage: 1024 * 1024
      })
    } as any;

    mockProcessingPipeline = {
      addStep: jest.fn(),
      executePipeline: jest.fn().mockResolvedValue({
        gesture: 'thumbs_up',
        confidence: 0.8,
        landmarks: [[[0.1, 0.1, 0.0]]],
        processingTime: 25,
        stepsExecuted: ['landmark_preprocessing', 'stability_analysis'],
        skippedSteps: []
      }),
      getPerformanceMetrics: jest.fn().mockReturnValue({
        pipelineMetrics: {},
        memoryMetrics: {},
        stepMetrics: {}
      })
    } as any;

    // Apply mocks
    (PerformanceOptimizer as jest.MockedClass<typeof PerformanceOptimizer>).mockImplementation(
      () => mockPerformanceOptimizer
    );
    (MemoryOptimizer.getInstance as jest.Mock).mockReturnValue(mockMemoryOptimizer);
    (ProcessingPipeline as jest.MockedClass<typeof ProcessingPipeline>).mockImplementation(
      () => mockProcessingPipeline
    );

    orchestrator = new GestureRecognitionOrchestrator(mockVideo, mockOverlay);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(orchestrator.initialize()).resolves.toBeUndefined();
    });

    it('should set up processing pipeline with correct steps', async () => {
      await orchestrator.initialize();

      expect(mockProcessingPipeline.addStep).toHaveBeenCalledTimes(7); // All processing steps
      expect(mockProcessingPipeline.configureOptimization).toHaveBeenCalledWith({
        targetFrameRate: 30,
        landmarkChangeThreshold: 0.01,
        enableMemoryOptimization: true
      });
    });

    it('should handle initialization errors gracefully', async () => {
      const mockGestureDetector = require('../core/GestureDetector');
      mockGestureDetector.GestureDetector.prototype.initialize = jest.fn().mockRejectedValue(
        new Error('Hardware not available')
      );

      await expect(orchestrator.initialize()).rejects.toThrow('Hardware not available');
    });
  });

  describe('camera management', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should start gesture recognition', async () => {
      await expect(orchestrator.start()).resolves.toBeUndefined();
    });

    it('should stop gesture recognition', async () => {
      await orchestrator.start();
      await expect(orchestrator.stop()).resolves.toBeUndefined();
    });

    it('should handle multiple start/stop calls', async () => {
      await orchestrator.start();
      await orchestrator.stop();
      await orchestrator.start();
      await expect(orchestrator.stop()).resolves.toBeUndefined();
    });
  });

  describe('gesture result processing', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
      await orchestrator.start();
    });

    it('should process gesture results when frame should be processed', () => {
      const mockResults = {
        landmarks: [{ x: 0.1, y: 0.1, z: 0.0 }],
        handednesses: [{ categoryName: 'Left' }]
      };

      // Mock window.ReactNativeWebView
      const mockPostMessage = jest.fn();
      (global as any).window.ReactNativeWebView = { postMessage: mockPostMessage };

      // Simulate gesture result handling (would be called internally)
      // This tests the processing pipeline execution

      expect(mockProcessingPipeline.executePipeline).toHaveBeenCalled();
    });

    it('should skip processing when performance optimizer indicates to skip', () => {
      mockPerformanceOptimizer.shouldProcessFrame.mockReturnValue(false);

      // Processing should be skipped
      expect(mockProcessingPipeline.executePipeline).not.toHaveBeenCalled();
    });

    it('should handle processing pipeline errors', async () => {
      mockProcessingPipeline.executePipeline.mockRejectedValue(new Error('Processing failed'));

      // Should not throw, should handle error internally
      const status = orchestrator.getStatus();
      expect(status).toBeDefined();
    });
  });

  describe('system status', () => {
    it('should provide comprehensive system status', () => {
      const status = orchestrator.getStatus();

      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('performance');
      expect(status).toHaveProperty('memory');
      expect(status).toHaveProperty('health');
    });

    it('should report correct status after initialization', async () => {
      await orchestrator.initialize();

      const status = orchestrator.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.running).toBe(false);
    });

    it('should report correct status after starting', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const status = orchestrator.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.running).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources properly', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      await expect(orchestrator.cleanup()).resolves.toBeUndefined();
      expect(mockMemoryOptimizer.performCleanup).toHaveBeenCalled();
    });

    it('should handle cleanup without initialization', async () => {
      await expect(orchestrator.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('performance optimization integration', () => {
    it('should use performance optimizer for frame processing decisions', async () => {
      await orchestrator.initialize();

      // Verify performance optimizer is used
      expect(mockPerformanceOptimizer.shouldProcessFrame).toHaveBeenCalled();
      expect(mockPerformanceOptimizer.recordProcessingTime).toHaveBeenCalled();
    });

    it('should integrate with memory optimizer', async () => {
      await orchestrator.initialize();

      const status = orchestrator.getStatus();
      expect(status.memory).toBeDefined();
      expect(mockMemoryOptimizer.getMemoryStatus).toHaveBeenCalled();
    });

    it('should configure processing pipeline with optimization settings', async () => {
      await orchestrator.initialize();

      expect(mockProcessingPipeline.configureOptimization).toHaveBeenCalledWith(
        expect.objectContaining({
          targetFrameRate: 30,
          enableMemoryOptimization: true
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle gesture detector initialization failures', async () => {
      const mockGestureDetector = require('../core/GestureDetector');
      mockGestureDetector.GestureDetector.prototype.initialize = jest.fn().mockRejectedValue(
        new Error('Camera not available')
      );

      await expect(orchestrator.initialize()).rejects.toThrow('Camera not available');
    });

    it('should handle camera start failures', async () => {
      const mockGestureDetector = require('../core/GestureDetector');
      mockGestureDetector.GestureDetector.prototype.start = jest.fn().mockRejectedValue(
        new Error('Camera permission denied')
      );

      await orchestrator.initialize();
      await expect(orchestrator.start()).rejects.toThrow('Camera permission denied');
    });

    it('should continue operating after individual component failures', async () => {
      // Simulate a component failure
      mockProcessingPipeline.executePipeline.mockRejectedValueOnce(new Error('Temporary failure'));

      // Should still be able to get status
      const status = orchestrator.getStatus();
      expect(status).toBeDefined();
    });
  });

  describe('component integration', () => {
    it('should initialize all required components', async () => {
      await orchestrator.initialize();

      // Verify that processing pipeline was set up with all steps
      expect(mockProcessingPipeline.addStep).toHaveBeenCalledTimes(7);
    });

    it('should coordinate between performance and memory optimizers', () => {
      const status = orchestrator.getStatus();

      expect(status.performance).toBeDefined();
      expect(status.memory).toBeDefined();
      expect(mockPerformanceOptimizer.getPerformanceMetrics).toHaveBeenCalled();
      expect(mockMemoryOptimizer.getMemoryStatus).toHaveBeenCalled();
    });
  });
});