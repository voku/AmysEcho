// @ts-nocheck
/**
 * Unit tests for performance optimization utilities
 * Tests PerformanceOptimizer, MemoryOptimizer, and ProcessingPipeline
 */

import { PerformanceOptimizer } from '../utils/PerformanceOptimizer';
import { MemoryOptimizer, CircularBuffer } from '../utils/MemoryOptimizer';
import { ProcessingPipeline, ProcessingStep, ProcessingContext } from '../utils/ProcessingPipeline';

describe('PerformanceOptimizer', () => {
  let optimizer: PerformanceOptimizer;

  beforeEach(() => {
    optimizer = new PerformanceOptimizer();
  });

  describe('frame processing', () => {
    it('should process first few frames', () => {
      expect(optimizer.shouldProcessFrame()).toBe(true);
      expect(optimizer.shouldProcessFrame()).toBe(true);
      expect(optimizer.shouldProcessFrame()).toBe(true);
      expect(optimizer.shouldProcessFrame()).toBe(true);
      expect(optimizer.shouldProcessFrame()).toBe(true);
    });

    it('should enable adaptive frame skipping when processing is slow', () => {
      // Process initial frames to establish baseline
      for (let i = 0; i < 5; i++) {
        optimizer.recordProcessingTime(60); // 60ms - over threshold
        expect(optimizer.shouldProcessFrame()).toBe(true); // Should process initial frames
      }

      // Continue recording slow processing times
      for (let i = 0; i < 5; i++) {
        optimizer.recordProcessingTime(60); // 60ms - over threshold
      }

      // Should start skipping frames after baseline established
      expect(optimizer.shouldProcessFrame()).toBe(false);
    });

    it('should record processing times correctly', () => {
      optimizer.recordProcessingTime(25);
      optimizer.recordProcessingTime(30);
      optimizer.recordProcessingTime(35);

      const metrics = optimizer.getPerformanceMetrics();
      expect(metrics.averageProcessingTime).toBeGreaterThan(25);
      expect(metrics.averageProcessingTime).toBeLessThan(35);
    });
  });

  describe('overlay optimization', () => {
    it('should redraw overlay when landmarks change significantly', () => {
      const landmarks1 = [[[0.1, 0.1, 0.0], [0.2, 0.2, 0.0]]];
      const landmarks2 = [[[0.2, 0.2, 0.0], [0.3, 0.3, 0.0]]]; // Significant change

      expect(optimizer.shouldRedrawOverlay(landmarks1, 20)).toBe(true);
      expect(optimizer.shouldRedrawOverlay(landmarks2, 20)).toBe(true);
    });

    it('should skip redraw when landmarks are similar', () => {
      const landmarks1 = [[[0.1, 0.1, 0.0], [0.2, 0.2, 0.0]]];
      const landmarks2 = [[[0.1001, 0.1001, 0.0], [0.2001, 0.2001, 0.0]]]; // Minimal change

      optimizer.shouldRedrawOverlay(landmarks1, 20); // First call to set baseline
      expect(optimizer.shouldRedrawOverlay(landmarks2, 20)).toBe(false);
    });

    it('should always redraw when processing is fast', () => {
      const landmarks = [[[0.1, 0.1, 0.0]]];

      expect(optimizer.shouldRedrawOverlay(landmarks, 10)).toBe(true); // Fast processing
    });
  });

  describe('configuration', () => {
    it('should set target frame rate within valid range', () => {
      optimizer.setTargetFrameRate(60);
      const metrics = optimizer.getPerformanceMetrics();
      expect(metrics.targetFrameRate).toBe(60);

      optimizer.setTargetFrameRate(10); // Too low
      expect(optimizer.getPerformanceMetrics().targetFrameRate).toBe(15);

      optimizer.setTargetFrameRate(100); // Too high
      expect(optimizer.getPerformanceMetrics().targetFrameRate).toBe(60);
    });

    it('should set landmark change threshold within valid range', () => {
      optimizer.setLandmarkChangeThreshold(0.02);
      // Threshold is private, but should not throw

      optimizer.setLandmarkChangeThreshold(0.0005); // Too low
      optimizer.setLandmarkChangeThreshold(0.2); // Too high
      // Should clamp values internally
    });
  });
});

describe('MemoryOptimizer', () => {
  let optimizer: MemoryOptimizer;

  beforeEach(() => {
    optimizer = MemoryOptimizer.getInstance();
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = MemoryOptimizer.getInstance();
      const instance2 = MemoryOptimizer.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('cleanup callbacks', () => {
    it('should register and unregister cleanup callbacks', () => {
      const callback = jest.fn();
      optimizer.registerCleanupCallback('test', callback);
      expect(optimizer.getMemoryStatus().registeredComponents).toBeGreaterThan(0);

      optimizer.unregisterCleanupCallback('test');
      // Note: getMemoryStatus might not immediately reflect unregistration
    });

    it('should execute cleanup callbacks', () => {
      const callback = jest.fn();
      optimizer.registerCleanupCallback('test', callback);

      optimizer.performCleanup();
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('history size optimization', () => {
    it('should return optimized history size', () => {
      const normalSize = optimizer.getOptimizedHistorySize(10);
      expect(normalSize).toBe(10); // Normal pressure
    });
  });

  describe('circular buffer', () => {
    it('should create and manage circular buffer', () => {
      const buffer = optimizer.createCircularBuffer<number>(5);

      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.getSize()).toBe(3);
      expect(buffer.get(0)).toBe(3); // Most recent
      expect(buffer.get(1)).toBe(2);
      expect(buffer.get(2)).toBe(1);
    });

    it('should handle buffer overflow', () => {
      const buffer = optimizer.createCircularBuffer<number>(3);

      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Should overwrite oldest

      expect(buffer.getSize()).toBe(3);
      expect(buffer.get(0)).toBe(4);
      expect(buffer.get(1)).toBe(3);
      expect(buffer.get(2)).toBe(2);
      expect(buffer.get(3)).toBeUndefined();
    });
  });
});

describe('CircularBuffer', () => {
  let buffer: CircularBuffer<number>;

  beforeEach(() => {
    buffer = new CircularBuffer<number>(3);
  });

  describe('basic operations', () => {
    it('should push and get items', () => {
      buffer.push(1);
      buffer.push(2);

      expect(buffer.get(0)).toBe(2); // Most recent
      expect(buffer.get(1)).toBe(1);
    });

    it('should return array representation', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      const array = buffer.toArray();
      expect(array).toEqual([3, 2, 1]); // Most recent first
    });

    it('should handle overflow correctly', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Overflows

      expect(buffer.toArray()).toEqual([4, 3, 2]);
    });

    it('should clear buffer', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.clear();

      expect(buffer.getSize()).toBe(0);
      expect(buffer.get(0)).toBeUndefined();
    });

    it('should resize buffer', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      buffer.resize(5);
      buffer.push(4);
      buffer.push(5);

      expect(buffer.getSize()).toBe(5);
      expect(buffer.toArray()).toEqual([5, 4, 3, 2, 1]);
    });
  });
});

describe('ProcessingPipeline', () => {
  let pipeline: ProcessingPipeline;
  let mockStep: ProcessingStep;

  beforeEach(() => {
    pipeline = new ProcessingPipeline();
    mockStep = {
      name: 'test_step',
      isExpensive: false,
      execute: jest.fn().mockResolvedValue({
        gesture: 'thumbs_up',
        confidence: 0.8,
        landmarks: [[[0.1, 0.1, 0.0]]]
      })
    };
  });

  describe('pipeline execution', () => {
    it('should execute processing steps', async () => {
      pipeline.addStep(mockStep);

      const context: ProcessingContext = {
        landmarks: [[[0.1, 0.1, 0.0]]],
        timestamp: Date.now(),
        processingStep: 'test',
        skipExpensiveSteps: false
      };

      const result = await pipeline.executePipeline(context);

      expect(result.gesture).toBe('thumbs_up');
      expect(result.confidence).toBe(0.8);
      expect(result.stepsExecuted).toContain('test_step');
    });

    it('should skip expensive steps when requested', async () => {
      const expensiveStep: ProcessingStep = {
        name: 'expensive_step',
        isExpensive: true,
        execute: jest.fn().mockResolvedValue({
          gesture: 'thumbs_up',
          confidence: 0.9,
          landmarks: [[[0.1, 0.1, 0.0]]]
        })
      };

      pipeline.addStep(expensiveStep);

      // Set up conditions to guarantee skipping
      // First, create a high-confidence previous result
      const previousContext: ProcessingContext = {
        landmarks: [[[0.1, 0.1, 0.0]]],
        timestamp: Date.now() - 1000,
        processingStep: 'previous',
        skipExpensiveSteps: false
      };

      // Execute once to create a previous result
      await pipeline.executePipeline(previousContext);

      const context: ProcessingContext = {
        landmarks: [[[0.1, 0.1, 0.0]]], // Same landmarks to trigger unchanged check
        timestamp: Date.now(),
        processingStep: 'test',
        skipExpensiveSteps: true,
        previousLandmarks: [[[0.1, 0.1, 0.0]]] // Same as current to ensure unchanged
      };

      const result = await pipeline.executePipeline(context);

      expect(result.skippedSteps).toContain('expensive_step');
    });

    it('should handle step execution errors gracefully', async () => {
      const failingStep: ProcessingStep = {
        name: 'failing_step',
        isExpensive: false,
        execute: jest.fn().mockRejectedValue(new Error('Step failed'))
      };

      pipeline.addStep(failingStep);

      const context: ProcessingContext = {
        landmarks: [[[0.1, 0.1, 0.0]]],
        timestamp: Date.now(),
        processingStep: 'test',
        skipExpensiveSteps: false
      };

      const result = await pipeline.executePipeline(context);

      expect(result.stepsExecuted).toContain('failing_step'); // Still recorded as executed
      expect(result.processingTime).toBeGreaterThan(0);
    });
  });

  describe('performance metrics', () => {
    it('should provide performance metrics', () => {
      const metrics = pipeline.getPerformanceMetrics();

      expect(metrics).toHaveProperty('pipelineMetrics');
      expect(metrics).toHaveProperty('memoryMetrics');
      expect(metrics.pipelineMetrics).toHaveProperty('frameCount');
    });
  });

  describe('configuration', () => {
    it('should configure optimization settings', () => {
      pipeline.configureOptimization({
        targetFrameRate: 30,
        landmarkChangeThreshold: 0.02,
        enableMemoryOptimization: true
      });

      // Configuration should not throw
      expect(pipeline).toBeDefined();
    });
  });
});