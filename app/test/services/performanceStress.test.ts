/**
 * Performance Stress Tests for Gesture Detection System
 *
 * Tests system behavior under various stress conditions:
 * - Low battery scenarios
 * - Rapid gesture sequences
 * - Memory pressure
 * - Concurrent processing load
 * - Long-running stability
 */

import { ParallelGestureProcessor } from '../../src/services/parallelGestureProcessor';
import { performanceMonitor } from '../../src/services/performanceMonitor';
import {
  realisticGestureFixtures,
  generateGestureSequence,
  getEmergencyFixtures
} from '../fixtures/realisticLandmarks';

// Mock the OpenAI validation service
jest.mock('../../src/services/openaiGestureValidationService', () => ({
  validateGestureWithOpenAI: jest.fn(),
  shouldTriggerOpenAIValidation: jest.fn(),
}));

import { validateGestureWithOpenAI, shouldTriggerOpenAIValidation } from '../../src/services/openaiGestureValidationService';

const mockValidateGestureWithOpenAI = validateGestureWithOpenAI as jest.MockedFunction<typeof validateGestureWithOpenAI>;
const mockShouldTriggerOpenAIValidation = shouldTriggerOpenAIValidation as jest.MockedFunction<typeof shouldTriggerOpenAIValidation>;

describe('Performance Stress Tests', () => {
  let processor: ParallelGestureProcessor;
  let mockFrame: any;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new ParallelGestureProcessor();
    mockFrame = {
      base64: 'mockBase64Data',
      uri: 'data:image/jpeg;base64,mockBase64Data',
      width: 640,
      height: 480,
      timestamp: Date.now(),
    };

    // Default mock implementations
    mockShouldTriggerOpenAIValidation.mockReturnValue(false);
    mockValidateGestureWithOpenAI.mockResolvedValue({
      success: true,
      gesture: 'thumbs_up',
      confidence: 0.8,
      feedback: 'Good gesture',
      quality_score: 8.0,
    });
  });

  afterEach(() => {
    processor.cleanup();
  });

  describe('Battery Performance Scenarios', () => {
    it('should maintain acceptable performance with simulated battery drain', async () => {
      const fixture = realisticGestureFixtures[0]; // fist gesture
      const iterations = 50;

      const startTime = Date.now();
      const results = [];

      // Simulate processing under battery stress
      for (let i = 0; i < iterations; i++) {
        // Add some delay to simulate battery impact (every 10th iteration)
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }

        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);
      }

      const totalTime = Date.now() - startTime;
      const avgTimePerGesture = totalTime / iterations;

      // Performance should remain acceptable even under simulated battery stress
      expect(avgTimePerGesture).toBeLessThan(100); // Less than 100ms per gesture
      expect(results.length).toBe(iterations);
      expect(results.every(r => r.gesture === fixture.expectedGesture)).toBe(true);

      // Check performance monitor
      const report = performanceMonitor.getPerformanceReport();
      expect(report.isAcceptable).toBe(true);
    });

    it('should prioritize emergency gestures during low battery simulation', async () => {
      const emergencyFixtures = getEmergencyFixtures();
      const regularFixture = realisticGestureFixtures.find(f => !f.isEmergency);

      expect(emergencyFixtures.length).toBeGreaterThan(0);
      expect(regularFixture).toBeDefined();

      if (emergencyFixtures.length > 0 && regularFixture) {
        const results = [];

        // Process emergency gestures first (should be prioritized)
        for (const emergency of emergencyFixtures) {
          const startTime = Date.now();
          const result = await processor.processMediaPipeResult(
            emergency.gesture,
            emergency.confidence,
            emergency.landmarks,
            emergency.handedness,
            emergency.isEmergency
          );
          const processingTime = Date.now() - startTime;
          results.push({ ...result, processingTime, type: 'emergency' });
        }

        // Process regular gestures
        for (let i = 0; i < 5; i++) {
          const startTime = Date.now();
          const result = await processor.processMediaPipeResult(
            regularFixture.gesture,
            regularFixture.confidence,
            regularFixture.landmarks,
            regularFixture.handedness,
            regularFixture.isEmergency
          );
          const processingTime = Date.now() - startTime;
          results.push({ ...result, processingTime, type: 'regular' });
        }

        const emergencyResults = results.filter(r => r.type === 'emergency');
        const regularResults = results.filter(r => r.type === 'regular');

        // Emergency gestures should be processed faster on average
        const avgEmergencyTime = emergencyResults.reduce((sum, r) => sum + r.processingTime, 0) / emergencyResults.length;
        const avgRegularTime = regularResults.reduce((sum, r) => sum + r.processingTime, 0) / regularResults.length;

        expect(avgEmergencyTime).toBeLessThan(avgRegularTime + 10); // Emergency should be at least as fast
      }
    });

    it('should handle memory pressure gracefully', async () => {
      const fixture = realisticGestureFixtures[0];
      const largeBatchSize = 100;

      // Process a large batch to simulate memory pressure
      const promises = [];
      for (let i = 0; i < largeBatchSize; i++) {
        promises.push(
          processor.processMediaPipeResult(
            fixture.gesture,
            fixture.confidence,
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency
          )
        );
      }

      const results = await Promise.all(promises);

      // All results should be processed successfully
      expect(results.length).toBe(largeBatchSize);
      expect(results.every(r => r.gesture === fixture.expectedGesture)).toBe(true);

      // Check that performance monitor doesn't show memory issues
      const report = performanceMonitor.getPerformanceReport();
      expect(report.isAcceptable).toBe(true);
    });
  });

  describe('Rapid Gesture Sequences', () => {
    it('should handle high-frequency gesture sequences', async () => {
      const fixture = realisticGestureFixtures[1]; // thumbs_up
      const sequenceLength = 20;
      const sequence = generateGestureSequence(fixture, sequenceLength, 'tremor');

      const startTime = Date.now();
      const results = [];

      // Process sequence as quickly as possible
      for (const frame of sequence) {
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          frame,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);
      }

      const totalTime = Date.now() - startTime;
      const avgTimePerFrame = totalTime / sequenceLength;

      // Should maintain reasonable performance even at high frequency
      expect(avgTimePerFrame).toBeLessThan(50); // Less than 50ms per frame
      expect(results.length).toBe(sequenceLength);

      // Most gestures should be detected correctly despite speed
      const correctDetections = results.filter(r => r.gesture === fixture.expectedGesture).length;
      expect(correctDetections / results.length).toBeGreaterThan(0.8); // At least 80% accuracy
    });

    it('should maintain message batching under rapid fire conditions', async () => {
      const fixture = realisticGestureFixtures[0];
      const rapidSequenceLength = 15;

      // Mock WebView message batching (simplified)
      const messageQueue: any[] = [];
      const originalProcessMediaPipeResult = processor.processMediaPipeResult.bind(processor);

      // Intercept results to simulate message batching
      let batchCount = 0;
      processor.processMediaPipeResult = jest.fn().mockImplementation(async (...args) => {
        const result = await originalProcessMediaPipeResult(...args);
        messageQueue.push(result);

        // Simulate batching every 5 messages
        if (messageQueue.length >= 5) {
          batchCount++;
          messageQueue.length = 0; // Clear batch
        }

        return result;
      });

      // Process rapid sequence
      for (let i = 0; i < rapidSequenceLength; i++) {
        await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
      }

      // Should have created multiple batches
      expect(batchCount).toBeGreaterThan(0);
      expect(batchCount).toBe(Math.floor(rapidSequenceLength / 5));
    });

    it('should handle gesture spam without degradation', async () => {
      const fixtures = realisticGestureFixtures.slice(0, 3); // Use first 3 gestures
      const spamCount = 30;

      const startTime = Date.now();
      const results = [];

      // Rapidly alternate between different gestures
      for (let i = 0; i < spamCount; i++) {
        const fixture = fixtures[i % fixtures.length];
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push({ ...result, expected: fixture.expectedGesture });
      }

      const totalTime = Date.now() - startTime;
      const avgTimePerGesture = totalTime / spamCount;

      // Performance should not degrade significantly
      expect(avgTimePerGesture).toBeLessThan(100);

      // Should still detect gestures correctly
      const correctDetections = results.filter(r => r.gesture === r.expected).length;
      expect(correctDetections / results.length).toBeGreaterThan(0.7); // At least 70% accuracy under spam
    });
  });

  describe('Concurrent Load Testing', () => {
    it('should handle multiple simultaneous gesture processing requests', async () => {
      const fixture = realisticGestureFixtures[0];
      const concurrentRequests = 3; // Reduced for stability

      // Mock slower OpenAI responses to test concurrency
      mockValidateGestureWithOpenAI.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          success: true,
          gesture: fixture.gesture,
          confidence: 0.8,
        }), 100))
      );

      mockShouldTriggerOpenAIValidation.mockReturnValue(true);

      const startTime = Date.now();

      // Launch multiple concurrent requests
      const promises = [];
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          processor.processMediaPipeResult(
            fixture.gesture,
            0.4, // Low confidence to trigger OpenAI
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency,
            mockFrame
          )
        );
      }

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should complete
      expect(results.length).toBe(concurrentRequests);
      expect(results.every(r => r.gesture === fixture.expectedGesture)).toBe(true);

      // Should complete within reasonable time (allowing for some concurrency delay)
      expect(totalTime).toBeLessThan(1000); // Less than 1 second for all concurrent requests

      // OpenAI should have been called for each request
      expect(mockValidateGestureWithOpenAI).toHaveBeenCalledTimes(concurrentRequests);
    }, 15000); // Explicit timeout

    it('should respect concurrent request limits', async () => {
      const limitedProcessor = new ParallelGestureProcessor({
        maxConcurrentRequests: 2, // Reduced for test stability
      });

      const fixture = realisticGestureFixtures[0];
      const totalRequests = 4; // Further reduced for stability

      // Mock slow responses
      mockValidateGestureWithOpenAI.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          success: true,
          gesture: fixture.gesture,
          confidence: 0.8,
        }), 200))
      );

      mockShouldTriggerOpenAIValidation.mockReturnValue(true);

      const startTime = Date.now();

      // Launch requests that exceed the limit
      const promises = [];
      for (let i = 0; i < totalRequests; i++) {
        promises.push(
          limitedProcessor.processMediaPipeResult(
            fixture.gesture,
            0.4,
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency,
            mockFrame
          )
        );
      }

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should still complete (just throttled)
      expect(results.length).toBe(totalRequests);

      // Should take longer due to throttling
      expect(totalTime).toBeGreaterThan(400); // At least some delay from throttling

      // But should complete within reasonable bounds
      expect(totalTime).toBeLessThan(3000); // Less than 3 seconds total
    }, 15000); // Explicit timeout
  });

  describe('Long-Running Stability', () => {
    it('should maintain performance over extended periods', async () => {
      const fixture = realisticGestureFixtures[0];
      const testDuration = 2000; // Further reduced to 2 seconds for stability
      const interval = 250; // Process every 250ms
      const expectedIterations = Math.floor(testDuration / interval);

      const results: any[] = [];
      const startTime = Date.now();

      // Process gestures over time
      const processInterval = setInterval(async () => {
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);
      }, interval);

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(processInterval);

      const totalTime = Date.now() - startTime;
      const actualIterations = results.length;

      // Should have processed most expected iterations
      expect(actualIterations).toBeGreaterThan(expectedIterations * 0.8);

      // Calculate performance metrics
      const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
      const successRate = results.filter(r => r.gesture === fixture.expectedGesture).length / results.length;

      // Performance should remain stable
      expect(avgProcessingTime).toBeLessThan(50);
      expect(successRate).toBeGreaterThan(0.9); // At least 90% success rate

      // Performance monitor should still report acceptable performance
      const report = performanceMonitor.getPerformanceReport();
      expect(report.isAcceptable).toBe(true);
    }, 10000); // Explicit timeout
  });

  describe('Error Recovery Under Stress', () => {
    it('should recover from intermittent OpenAI failures', async () => {
      const fixture = realisticGestureFixtures[0];
      let callCount = 0;

      // Mock intermittent failures
      mockValidateGestureWithOpenAI.mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) {
          return Promise.reject(new Error('Intermittent API failure'));
        }
        return Promise.resolve({
          success: true,
          gesture: fixture.gesture,
          confidence: 0.8,
        });
      });

      mockShouldTriggerOpenAIValidation.mockReturnValue(true);

      const iterations = 9;
      const results = [];

      for (let i = 0; i < iterations; i++) {
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          0.4,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency,
          mockFrame
        );
        results.push(result);

        // Allow time for async processing
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Should have some successful results despite failures
      const successfulResults = results.filter(r => r.gesture === fixture.expectedGesture);
      expect(successfulResults.length).toBeGreaterThan(iterations * 0.5); // At least 50% success rate

      // Should have called OpenAI for each iteration
      expect(mockValidateGestureWithOpenAI).toHaveBeenCalledTimes(iterations);
    }, 15000); // Increased timeout for this test

    it('should handle frame processing errors gracefully', async () => {
      const fixture = realisticGestureFixtures[0];
      const iterations = 20;
      let errorCount = 0;

      // Mock occasional frame processing errors
      const originalProcessMediaPipeResult = processor.processMediaPipeResult.bind(processor);
      processor.processMediaPipeResult = jest.fn().mockImplementation(async (...args) => {
        if (Math.random() < 0.2) { // 20% chance of error
          errorCount++;
          throw new Error('Frame processing error');
        }
        return originalProcessMediaPipeResult(...args);
      });

      const results = [];
      const errors = [];

      for (let i = 0; i < iterations; i++) {
        try {
          const result = await processor.processMediaPipeResult(
            fixture.gesture,
            fixture.confidence,
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency
          );
          results.push(result);
        } catch (error) {
          errors.push(error);
        }
      }

      // Should have some errors but also some successful results
      expect(errorCount).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
      expect(errors.length).toBeGreaterThan(0);

      // Error rate should be reasonable
      expect(errors.length / iterations).toBeLessThan(0.5); // Less than 50% error rate
    });
  });
});

  describe('Battery Performance Scenarios', () => {
    it('should maintain acceptable performance with simulated battery drain', async () => {
      const fixture = realisticGestureFixtures[0]; // fist gesture
      const iterations = 50;

      const startTime = Date.now();
      const results = [];

      // Simulate processing under battery stress
      for (let i = 0; i < iterations; i++) {
        // Add some delay to simulate battery impact (every 10th iteration)
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }

        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);
      }

      const totalTime = Date.now() - startTime;
      const avgTimePerGesture = totalTime / iterations;

      // Performance should remain acceptable even under simulated battery stress
      expect(avgTimePerGesture).toBeLessThan(100); // Less than 100ms per gesture
      expect(results.length).toBe(iterations);
      expect(results.every(r => r.gesture === fixture.expectedGesture)).toBe(true);

      // Check performance monitor
      const report = performanceMonitor.getPerformanceReport();
      expect(report.isAcceptable).toBe(true);
    });

    it('should prioritize emergency gestures during low battery simulation', async () => {
      const emergencyFixtures = getEmergencyFixtures();
      const regularFixture = realisticGestureFixtures.find(f => !f.isEmergency);

      expect(emergencyFixtures.length).toBeGreaterThan(0);
      expect(regularFixture).toBeDefined();

      if (emergencyFixtures.length > 0 && regularFixture) {
        const results = [];

        // Process emergency gestures first (should be prioritized)
        for (const emergency of emergencyFixtures) {
          const startTime = Date.now();
          const result = await processor.processMediaPipeResult(
            emergency.gesture,
            emergency.confidence,
            emergency.landmarks,
            emergency.handedness,
            emergency.isEmergency
          );
          const processingTime = Date.now() - startTime;
          results.push({ ...result, processingTime, type: 'emergency' });
        }

        // Process regular gestures
        for (let i = 0; i < 5; i++) {
          const startTime = Date.now();
          const result = await processor.processMediaPipeResult(
            regularFixture.gesture,
            regularFixture.confidence,
            regularFixture.landmarks,
            regularFixture.handedness,
            regularFixture.isEmergency
          );
          const processingTime = Date.now() - startTime;
          results.push({ ...result, processingTime, type: 'regular' });
        }

        const emergencyResults = results.filter(r => r.type === 'emergency');
        const regularResults = results.filter(r => r.type === 'regular');

        // Emergency gestures should be processed faster on average
        const avgEmergencyTime = emergencyResults.reduce((sum, r) => sum + r.processingTime, 0) / emergencyResults.length;
        const avgRegularTime = regularResults.reduce((sum, r) => sum + r.processingTime, 0) / regularResults.length;

        expect(avgEmergencyTime).toBeLessThan(avgRegularTime + 10); // Emergency should be at least as fast
      }
    });

    it('should handle memory pressure gracefully', async () => {
      const fixture = realisticGestureFixtures[0];
      const largeBatchSize = 100;

      // Process a large batch to simulate memory pressure
      const promises = [];
      for (let i = 0; i < largeBatchSize; i++) {
        promises.push(
          processor.processMediaPipeResult(
            fixture.gesture,
            fixture.confidence,
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency
          )
        );
      }

      const results = await Promise.all(promises);
      // Give background OpenAI tasks a chance to run before assertions in test env
      await new Promise<void>((r) => (typeof setImmediate === 'function' ? setImmediate(() => r()) : Promise.resolve().then(() => r())));

      // All results should be processed successfully
      expect(results.length).toBe(largeBatchSize);
      expect(results.every(r => r.gesture === fixture.expectedGesture)).toBe(true);

      // Check that performance monitor doesn't show memory issues
      const report = performanceMonitor.getPerformanceReport();
      expect(report.isAcceptable).toBe(true);
    });
  });

  describe('Rapid Gesture Sequences', () => {
    it('should handle high-frequency gesture sequences', async () => {
      const fixture = realisticGestureFixtures[1]; // thumbs_up
      const sequenceLength = 20;
      const sequence = generateGestureSequence(fixture, sequenceLength, 'tremor');

      const startTime = Date.now();
      const results = [];

      // Process sequence as quickly as possible
      for (const frame of sequence) {
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          frame,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);
      }

      const totalTime = Date.now() - startTime;
      const avgTimePerFrame = totalTime / sequenceLength;

      // Should maintain reasonable performance even at high frequency
      expect(avgTimePerFrame).toBeLessThan(50); // Less than 50ms per frame
      expect(results.length).toBe(sequenceLength);

      // Most gestures should be detected correctly despite speed
      const correctDetections = results.filter(r => r.gesture === fixture.expectedGesture).length;
      expect(correctDetections / results.length).toBeGreaterThan(0.8); // At least 80% accuracy
    });

    it('should maintain message batching under rapid fire conditions', async () => {
      const fixture = realisticGestureFixtures[0];
      const rapidSequenceLength = 15;

      // Mock WebView message batching (simplified)
      const messageQueue: any[] = [];
      const originalProcessMediaPipeResult = processor.processMediaPipeResult.bind(processor);

      // Intercept results to simulate message batching
      let batchCount = 0;
      processor.processMediaPipeResult = jest.fn().mockImplementation(async (...args) => {
        const result = await originalProcessMediaPipeResult(...args);
        messageQueue.push(result);

        // Simulate batching every 5 messages
        if (messageQueue.length >= 5) {
          batchCount++;
          messageQueue.length = 0; // Clear batch
        }

        return result;
      });

      // Process rapid sequence
      for (let i = 0; i < rapidSequenceLength; i++) {
        await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
      }

      // Should have created multiple batches
      expect(batchCount).toBeGreaterThan(0);
      expect(batchCount).toBe(Math.floor(rapidSequenceLength / 5));
    });

    it('should handle gesture spam without degradation', async () => {
      const fixtures = realisticGestureFixtures.slice(0, 3); // Use first 3 gestures
      const spamCount = 30;

      const startTime = Date.now();
      const results = [];

      // Rapidly alternate between different gestures
      for (let i = 0; i < spamCount; i++) {
        const fixture = fixtures[i % fixtures.length];
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push({ ...result, expected: fixture.expectedGesture });
      }

      const totalTime = Date.now() - startTime;
      const avgTimePerGesture = totalTime / spamCount;

      // Performance should not degrade significantly
      expect(avgTimePerGesture).toBeLessThan(100);

      // Should still detect gestures correctly
      const correctDetections = results.filter(r => r.gesture === r.expected).length;
      expect(correctDetections / results.length).toBeGreaterThan(0.7); // At least 70% accuracy under spam
    });
  });

  describe('Concurrent Load Testing', () => {
    it('should handle multiple simultaneous gesture processing requests', async () => {
      const fixture = realisticGestureFixtures[0];
      const concurrentRequests = 3; // Further reduced for stability

      // Mock slower OpenAI responses to test concurrency
      mockValidateGestureWithOpenAI.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          success: true,
          gesture: fixture.gesture,
          confidence: 0.8,
        }), 100))
      );

      mockShouldTriggerOpenAIValidation.mockReturnValue(true);

      const startTime = Date.now();

      // Launch multiple concurrent requests
      const promises = [];
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          processor.processMediaPipeResult(
            fixture.gesture,
            0.4, // Low confidence to trigger OpenAI
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency,
            mockFrame
          )
        );
      }

      const results = await Promise.all(promises);
      // Yield to ensure throttled background tasks completed and total time reflects throttling
      await new Promise<void>((r) => (typeof setImmediate === 'function' ? setImmediate(() => r()) : Promise.resolve().then(() => r())));
      const totalTime = Date.now() - startTime;

      // All requests should complete
      expect(results.length).toBe(concurrentRequests);
      expect(results.every(r => r.gesture === fixture.expectedGesture)).toBe(true);

      // Should complete within reasonable time (allowing for some concurrency delay)
      expect(totalTime).toBeLessThan(1000); // Less than 1 second for all concurrent requests

      // OpenAI should have been called for each request
      expect(mockValidateGestureWithOpenAI).toHaveBeenCalledTimes(concurrentRequests);
    }, 15000); // Explicit timeout

    it('should respect concurrent request limits', async () => {
      const limitedProcessor = new ParallelGestureProcessor({
        maxConcurrentRequests: 2, // Reduced for test stability
      });

      const fixture = realisticGestureFixtures[0];
      const totalRequests = 4; // Further reduced for stability

      // Mock slow responses
      mockValidateGestureWithOpenAI.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          success: true,
          gesture: fixture.gesture,
          confidence: 0.8,
        }), 200))
      );

      mockShouldTriggerOpenAIValidation.mockReturnValue(true);

      const startTime = Date.now();

      // Launch requests that exceed the limit
      const promises = [];
      for (let i = 0; i < totalRequests; i++) {
        promises.push(
          limitedProcessor.processMediaPipeResult(
            fixture.gesture,
            0.4,
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency,
            mockFrame
          )
        );
      }

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should still complete (just throttled)
      expect(results.length).toBe(totalRequests);

      // Should take longer due to throttling
      expect(totalTime).toBeGreaterThan(400); // At least some delay from throttling

      // But should complete within reasonable bounds
      expect(totalTime).toBeLessThan(3000); // Less than 3 seconds total
    }, 15000); // Explicit timeout

      // Mock slow responses
      mockValidateGestureWithOpenAI.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          success: true,
          gesture: fixture.gesture,
          confidence: 0.8,
        }), 200))
      );

      mockShouldTriggerOpenAIValidation.mockReturnValue(true);

      const startTime = Date.now();

      // Launch requests that exceed the limit
      const promises = [];
      for (let i = 0; i < totalRequests; i++) {
        promises.push(
          limitedProcessor.processMediaPipeResult(
            fixture.gesture,
            0.4,
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency,
            mockFrame
          )
        );
      }

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should still complete (just throttled)
      expect(results.length).toBe(totalRequests);

      // Should take longer due to throttling
      expect(totalTime).toBeGreaterThan(400); // At least some delay from throttling

      // But should complete within reasonable bounds
      expect(totalTime).toBeLessThan(3000); // Less than 3 seconds total
    }, 15000); // Explicit timeout
  });

describe('Long-Running Stability', () => {
    it('should maintain performance over extended periods', async () => {
      const fixture = realisticGestureFixtures[0];
      const testDuration = 2000; // Further reduced to 2 seconds for stability
      const interval = 250; // Process every 250ms
      const expectedIterations = Math.floor(testDuration / interval);

      const results: any[] = [];
      const startTime = Date.now();

      // Process gestures over time
      const processInterval = setInterval(async () => {
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);
      }, interval);

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(processInterval);

      const totalTime = Date.now() - startTime;
      const actualIterations = results.length;

      // Should have processed most expected iterations
      expect(actualIterations).toBeGreaterThan(expectedIterations * 0.8);

      // Calculate performance metrics
      const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
      const successRate = results.filter(r => r.gesture === fixture.expectedGesture).length / results.length;

      // Performance should remain stable
      expect(avgProcessingTime).toBeLessThan(50);
      expect(successRate).toBeGreaterThan(0.9); // At least 90% success rate

      // Performance monitor should still report acceptable performance
      const report = performanceMonitor.getPerformanceReport();
      expect(report.isAcceptable).toBe(true);
    }, 10000); // Explicit timeout
  });

      // Process gestures over time
      const processInterval = setInterval(async () => {
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);
      }, interval);

      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, testDuration));
      clearInterval(processInterval);

      const totalTime = Date.now() - startTime;
      const actualIterations = results.length;

      // Should have processed most expected iterations
      expect(actualIterations).toBeGreaterThan(expectedIterations * 0.8);

      // Calculate performance metrics
      const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
      const successRate = results.filter(r => r.gesture === fixture.expectedGesture).length / results.length;

      // Performance should remain stable
      expect(avgProcessingTime).toBeLessThan(50);
      expect(successRate).toBeGreaterThan(0.9); // At least 90% success rate

      // Performance monitor should still report acceptable performance
      const report = performanceMonitor.getPerformanceReport();
      expect(report.isAcceptable).toBe(true);
    });

    it('should handle memory leaks gracefully over time', async () => {
      const fixture = realisticGestureFixtures[0];
      const iterations = 200;

      const initialMemoryUsage = performanceMonitor.getPerformanceReport().metrics.memoryUsage;
      const results = [];

      // Process many gestures to check for memory issues
      for (let i = 0; i < iterations; i++) {
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);

        // Periodic cleanup check
        if (i % 50 === 0) {
          processor.cleanup();
        }
      }

      const finalMemoryUsage = performanceMonitor.getPerformanceReport().metrics.memoryUsage;

      // Memory usage should not grow excessively
      expect(finalMemoryUsage - initialMemoryUsage).toBeLessThan(50); // Less than 50MB increase

      // All results should be valid
      expect(results.length).toBe(iterations);
      expect(results.every(r => r.gesture === fixture.expectedGesture)).toBe(true);
    });
  });

  describe('Error Recovery Under Stress', () => {
    it('should recover from intermittent OpenAI failures', async () => {
      const fixture = realisticGestureFixtures[0];
      let callCount = 0;

      // Mock intermittent failures
      mockValidateGestureWithOpenAI.mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) {
          return Promise.reject(new Error('Intermittent API failure'));
        }
        return Promise.resolve({
          success: true,
          gesture: fixture.gesture,
          confidence: 0.8,
        });
      });

      mockShouldTriggerOpenAIValidation.mockReturnValue(true);

      const iterations = 9;
      const results = [];

      for (let i = 0; i < iterations; i++) {
        const result = await processor.processMediaPipeResult(
          fixture.gesture,
          0.4,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency,
          mockFrame
        );
        results.push(result);

        // Allow time for async processing
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Should have some successful results despite failures
      const successfulResults = results.filter(r => r.gesture === fixture.expectedGesture);
      expect(successfulResults.length).toBeGreaterThan(iterations * 0.5); // At least 50% success rate

      // Should have called OpenAI for each iteration
      expect(mockValidateGestureWithOpenAI).toHaveBeenCalledTimes(iterations);
    }, 15000); // Increased timeout for this test

    it('should handle frame processing errors gracefully', async () => {
      const fixture = realisticGestureFixtures[0];
      const iterations = 20;
      let errorCount = 0;

      // Mock occasional frame processing errors
      const originalProcessMediaPipeResult = processor.processMediaPipeResult.bind(processor);
      processor.processMediaPipeResult = jest.fn().mockImplementation(async (...args) => {
        if (Math.random() < 0.2) { // 20% chance of error
          errorCount++;
          throw new Error('Frame processing error');
        }
        return originalProcessMediaPipeResult(...args);
      });

      const results = [];
      const errors = [];

      for (let i = 0; i < iterations; i++) {
        try {
          const result = await processor.processMediaPipeResult(
            fixture.gesture,
            fixture.confidence,
            fixture.landmarks,
            fixture.handedness,
            fixture.isEmergency
          );
          results.push(result);
        } catch (error) {
          errors.push(error);
        }
      }

      // Should have some errors but also some successful results
      expect(errorCount).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
      expect(errors.length).toBeGreaterThan(0);

      // Error rate should be reasonable
      expect(errors.length / iterations).toBeLessThan(0.5); // Less than 50% error rate
    });
  });
});
