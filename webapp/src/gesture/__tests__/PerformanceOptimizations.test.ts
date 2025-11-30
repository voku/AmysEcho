import { vi } from 'vitest';
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

      const diagnostics = optimizer.getDiagnostics();
      expect(diagnostics.averageProcessingTime).toBeGreaterThan(25);
      expect(diagnostics.averageProcessingTime).toBeLessThan(35);
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

    it('should reset landmark signature and trigger redraw on next detection', () => {
      const landmarks1 = [[[0.1, 0.1, 0.0], [0.2, 0.2, 0.0]]];
      const landmarks2 = [[[0.1001, 0.1001, 0.0], [0.2001, 0.2001, 0.0]]]; // Minimal change

      // Set baseline
      optimizer.shouldRedrawOverlay(landmarks1, 20);
      // Normally would skip redraw for minimal change
      expect(optimizer.shouldRedrawOverlay(landmarks2, 20)).toBe(false);

      // Reset the signature (simulates no hands detected)
      optimizer.resetLandmarkSignature();

      // Now even minimal change should trigger redraw since signature was reset
      expect(optimizer.shouldRedrawOverlay(landmarks2, 20)).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should set target frame rate within valid range', () => {
      optimizer.setTargetFrameRate(60);
      const diagnostics = optimizer.getDiagnostics();
      expect(diagnostics.targetFrameRate).toBe(60);

      optimizer.setTargetFrameRate(10); // Too low
      expect(optimizer.getDiagnostics().targetFrameRate).toBe(15);

      optimizer.setTargetFrameRate(100); // Too high
      expect(optimizer.getDiagnostics().targetFrameRate).toBe(60);
    });

    it('should set landmark change threshold within valid range', () => {
      optimizer.setLandmarkChangeThreshold(0.02);
      // Threshold is private, but should not throw

      optimizer.setLandmarkChangeThreshold(0.0005); // Too low
      optimizer.setLandmarkChangeThreshold(0.2); // Too high
      // Should clamp values internally
    });
  });

  describe('diagnostics', () => {
    it('should return the last recorded processing time', () => {
      expect(optimizer.getLastProcessingTime()).toBe(0);

      optimizer.recordProcessingTime(25);
      expect(optimizer.getLastProcessingTime()).toBe(25);

      optimizer.recordProcessingTime(30);
      expect(optimizer.getLastProcessingTime()).toBe(30);
    });

    it('should correctly determine if performance is optimal', () => {
      optimizer.setTargetFrameRate(30); // 33.3ms per frame

      // No processing times recorded - should be optimal
      expect(optimizer.isPerformanceOptimal()).toBe(true);

      // Fast processing times
      optimizer.recordProcessingTime(10);
      optimizer.recordProcessingTime(15);
      expect(optimizer.isPerformanceOptimal()).toBe(true);

      // Slow processing times that exceed target
      optimizer.recordProcessingTime(50);
      optimizer.recordProcessingTime(60);
      optimizer.recordProcessingTime(70);
      expect(optimizer.isPerformanceOptimal()).toBe(false);
    });

    it('should track landmark signature state', () => {
      expect(optimizer.hasLandmarkSignature()).toBe(false);

      const landmarks = [[[0.1, 0.1, 0.0], [0.2, 0.2, 0.0]]];
      optimizer.shouldRedrawOverlay(landmarks, 20);

      expect(optimizer.hasLandmarkSignature()).toBe(true);

      optimizer.resetLandmarkSignature();
      expect(optimizer.hasLandmarkSignature()).toBe(false);
    });
  });

  describe('velocity-adaptive processing', () => {
    const VELOCITY_LOW_THRESHOLD = 0.005;
    const VELOCITY_HIGH_THRESHOLD = 0.02;

    it('should enable/disable velocity-adaptive mode', () => {
      expect(optimizer.isVelocityAdaptiveModeEnabled()).toBe(true); // Default enabled

      optimizer.setVelocityAdaptiveMode(false);
      expect(optimizer.isVelocityAdaptiveModeEnabled()).toBe(false);

      optimizer.setVelocityAdaptiveMode(true);
      expect(optimizer.isVelocityAdaptiveModeEnabled()).toBe(true);
    });

    it('should return full intensity when velocity-adaptive mode is disabled', () => {
      optimizer.setVelocityAdaptiveMode(false);
      optimizer.updateVelocityScore(0.001); // Very low velocity

      expect(optimizer.getProcessingIntensity()).toBe(1.0);
    });

    it('should return minimal intensity (0.3) for static hand (velocity below low threshold)', () => {
      optimizer.setVelocityAdaptiveMode(true);
      optimizer.updateVelocityScore(0.001); // Below VELOCITY_LOW_THRESHOLD (0.005)

      expect(optimizer.getProcessingIntensity()).toBe(0.3);
    });

    it('should return moderate intensity (0.6) for slow movement (velocity between thresholds)', () => {
      optimizer.setVelocityAdaptiveMode(true);
      optimizer.updateVelocityScore(0.01); // Between 0.005 and 0.02

      expect(optimizer.getProcessingIntensity()).toBe(0.6);
    });

    it('should return full intensity (1.0) for active movement (velocity above high threshold)', () => {
      optimizer.setVelocityAdaptiveMode(true);
      optimizer.updateVelocityScore(0.03); // Above VELOCITY_HIGH_THRESHOLD (0.02)

      expect(optimizer.getProcessingIntensity()).toBe(1.0);
    });

    it('should handle threshold boundary - exactly at low threshold', () => {
      optimizer.setVelocityAdaptiveMode(true);
      optimizer.updateVelocityScore(VELOCITY_LOW_THRESHOLD);

      // At exactly the low threshold, should be moderate (not minimal)
      expect(optimizer.getProcessingIntensity()).toBe(0.6);
    });

    it('should handle threshold boundary - exactly at high threshold', () => {
      optimizer.setVelocityAdaptiveMode(true);
      optimizer.updateVelocityScore(VELOCITY_HIGH_THRESHOLD);

      // At exactly the high threshold, should be full intensity
      expect(optimizer.getProcessingIntensity()).toBe(1.0);
    });

    it('should handle zero velocity', () => {
      optimizer.setVelocityAdaptiveMode(true);
      optimizer.updateVelocityScore(0);

      expect(optimizer.getProcessingIntensity()).toBe(0.3);
    });
  });

  describe('shouldSkipExpensiveProcessing', () => {
    it('should skip expensive processing when hand is static and has landmark signature', () => {
      // First set a landmark signature
      const landmarks = [[[0.1, 0.1, 0.0], [0.2, 0.2, 0.0]]];
      optimizer.shouldRedrawOverlay(landmarks, 20);
      expect(optimizer.hasLandmarkSignature()).toBe(true);

      // Set low velocity (static hand)
      optimizer.updateVelocityScore(0.001);

      expect(optimizer.shouldSkipExpensiveProcessing()).toBe(true);
    });

    it('should not skip expensive processing when no landmark signature exists', () => {
      // No landmark signature set
      expect(optimizer.hasLandmarkSignature()).toBe(false);

      // Even with low velocity, should not skip if no signature
      optimizer.updateVelocityScore(0.001);

      expect(optimizer.shouldSkipExpensiveProcessing()).toBe(false);
    });

    it('should not skip expensive processing when hand is moving', () => {
      // Set landmark signature
      const landmarks = [[[0.1, 0.1, 0.0], [0.2, 0.2, 0.0]]];
      optimizer.shouldRedrawOverlay(landmarks, 20);

      // Set high velocity (moving hand)
      optimizer.updateVelocityScore(0.03);

      expect(optimizer.shouldSkipExpensiveProcessing()).toBe(false);
    });

    it('should skip expensive processing when budget utilization is over 1.2', () => {
      // Record slow processing times to increase budget utilization
      optimizer.setTargetFrameRate(30); // ~33.3ms per frame
      for (let i = 0; i < 10; i++) {
        optimizer.recordProcessingTime(50); // Exceeds target
      }

      // Update velocity to trigger budget calculation
      optimizer.updateVelocityScore(0.03);

      // Budget utilization should be > 1.2
      expect(optimizer.getBudgetUtilization()).toBeGreaterThan(1.2);
      expect(optimizer.shouldSkipExpensiveProcessing()).toBe(true);
    });
  });

  describe('budget management', () => {
    it('should return initial budget of ~33ms for 30fps target', () => {
      optimizer.setTargetFrameRate(30);
      // Initial budget before any velocity updates
      expect(optimizer.getProcessingBudgetMs()).toBeCloseTo(33.33, 0);
    });

    it('should reduce processing budget for static hands', () => {
      optimizer.setTargetFrameRate(30);
      const fullBudget = 1000 / 30; // ~33.3ms

      // Update with low velocity (static hand)
      optimizer.updateVelocityScore(0.001);

      // Budget should be halved for static hands
      expect(optimizer.getProcessingBudgetMs()).toBeCloseTo(fullBudget * 0.5, 1);
    });

    it('should use full processing budget for moving hands', () => {
      optimizer.setTargetFrameRate(30);
      const fullBudget = 1000 / 30; // ~33.3ms

      // Update with high velocity (moving hand)
      optimizer.updateVelocityScore(0.03);

      expect(optimizer.getProcessingBudgetMs()).toBeCloseTo(fullBudget, 1);
    });

    it('should calculate budget utilization based on average processing time', () => {
      optimizer.setTargetFrameRate(30); // ~33.3ms per frame

      // Record processing times that are about half of target
      optimizer.recordProcessingTime(16);
      optimizer.recordProcessingTime(17);
      optimizer.recordProcessingTime(16);
      optimizer.updateVelocityScore(0.01); // Trigger budget calculation

      // Budget utilization should be about 0.5 (16.5ms / 33.3ms)
      expect(optimizer.getBudgetUtilization()).toBeCloseTo(0.5, 1);
    });

    it('should report budget utilization > 1.0 when over budget', () => {
      optimizer.setTargetFrameRate(30); // ~33.3ms per frame

      // Record processing times that exceed target
      for (let i = 0; i < 5; i++) {
        optimizer.recordProcessingTime(50);
      }
      optimizer.updateVelocityScore(0.01); // Trigger budget calculation

      // Budget utilization should be > 1.0
      expect(optimizer.getBudgetUtilization()).toBeGreaterThan(1.0);
    });
  });

  describe('getDiagnostics', () => {
    it('should return comprehensive performance diagnostics', () => {
      // Set up some state
      optimizer.setTargetFrameRate(30);
      optimizer.recordProcessingTime(20);
      optimizer.recordProcessingTime(25);
      optimizer.updateVelocityScore(0.015);

      const diagnostics = optimizer.getDiagnostics();

      expect(diagnostics).toHaveProperty('frameCount');
      expect(diagnostics).toHaveProperty('averageProcessingTime');
      expect(diagnostics).toHaveProperty('lastProcessingTime');
      expect(diagnostics).toHaveProperty('targetFrameRate');
      expect(diagnostics).toHaveProperty('adaptiveFrameSkipping');
      expect(diagnostics).toHaveProperty('skipFrameCount');
      expect(diagnostics).toHaveProperty('velocityScore');
      expect(diagnostics).toHaveProperty('processingIntensity');
      expect(diagnostics).toHaveProperty('budgetUtilization');
      expect(diagnostics).toHaveProperty('isOptimal');
    });

    it('should reflect velocity score in diagnostics', () => {
      optimizer.updateVelocityScore(0.025);

      const diagnostics = optimizer.getDiagnostics();
      expect(diagnostics.velocityScore).toBe(0.025);
    });

    it('should reflect processing intensity in diagnostics', () => {
      optimizer.setVelocityAdaptiveMode(true);
      optimizer.updateVelocityScore(0.001); // Static hand

      const diagnostics = optimizer.getDiagnostics();
      expect(diagnostics.processingIntensity).toBe(0.3);
    });
  });

  describe('reset', () => {
    it('should reset velocity-related state for clean baseline', () => {
      // Set up some state
      optimizer.setTargetFrameRate(30);
      optimizer.recordProcessingTime(25);
      optimizer.recordProcessingTime(30);
      optimizer.updateVelocityScore(0.015);
      
      // Set a landmark signature
      const landmarks = [[[0.1, 0.1, 0.0], [0.2, 0.2, 0.0]]];
      optimizer.shouldRedrawOverlay(landmarks, 20);
      
      // Process some frames
      for (let i = 0; i < 10; i++) {
        optimizer.shouldProcessFrame();
      }

      // Verify state is set
      const beforeDiagnostics = optimizer.getDiagnostics();
      expect(beforeDiagnostics.frameCount).toBeGreaterThan(0);
      expect(beforeDiagnostics.velocityScore).toBe(0.015);
      expect(beforeDiagnostics.lastProcessingTime).toBe(30);

      // Reset
      optimizer.reset();

      // Verify all state is reset
      const afterDiagnostics = optimizer.getDiagnostics();
      expect(afterDiagnostics.frameCount).toBe(0);
      expect(afterDiagnostics.velocityScore).toBe(0);
      expect(afterDiagnostics.lastProcessingTime).toBe(0);
      expect(afterDiagnostics.averageProcessingTime).toBe(0);
      expect(afterDiagnostics.budgetUtilization).toBe(0);
      expect(afterDiagnostics.adaptiveFrameSkipping).toBe(false);
      expect(afterDiagnostics.skipFrameCount).toBe(0);
      expect(optimizer.hasLandmarkSignature()).toBe(false);
      // Processing budget should be reset to target frame time
      expect(optimizer.getProcessingBudgetMs()).toBeCloseTo(1000 / 30, 0);
    });

    it('should not return stale velocity metrics after reset', () => {
      // Set up velocity state
      optimizer.setTargetFrameRate(30);
      optimizer.updateVelocityScore(0.03); // High velocity
      
      // Verify intensity is based on high velocity
      expect(optimizer.getProcessingIntensity()).toBe(1.0);
      
      // Reset
      optimizer.reset();
      
      // After reset, velocity should be 0, so intensity should be minimal
      expect(optimizer.getDiagnostics().velocityScore).toBe(0);
      expect(optimizer.getProcessingIntensity()).toBe(0.3); // Minimal for static (0 velocity)
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
      const callback = vi.fn();
      optimizer.registerCleanupCallback('test', callback);
      expect(optimizer.getMemoryStatus().registeredComponents).toBeGreaterThan(0);

      optimizer.unregisterCleanupCallback('test');
      // Note: getMemoryStatus might not immediately reflect unregistration
    });

    it('should execute cleanup callbacks', () => {
      const callback = vi.fn();
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
      execute: vi.fn().mockResolvedValue({
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
        execute: vi.fn().mockResolvedValue({
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
        execute: vi.fn().mockRejectedValue(new Error('Step failed'))
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
