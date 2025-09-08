/**
 * Test Helper Utilities for Realistic Gesture Testing
 *
 * Provides reusable utilities for:
 * - Generating realistic test data
 * - Simulating real-world conditions
 * - Common test patterns and assertions
 * - Performance measurement helpers
 */

import { ParallelGestureProcessor } from '../../src/services/parallelGestureProcessor';
import { performanceMonitor } from '../../src/services/performanceMonitor';
import {
  RealisticGestureFixture,
  realisticGestureFixtures,
  generateGestureSequence
} from '../fixtures/realisticLandmarks';

// Mock services for testing
jest.mock('../../src/services/openaiGestureValidationService', () => ({
  validateGestureWithOpenAI: jest.fn(),
  shouldTriggerOpenAIValidation: jest.fn(),
}));

import { validateGestureWithOpenAI, shouldTriggerOpenAIValidation } from '../../src/services/openaiGestureValidationService';

export interface TestContext {
  processor: ParallelGestureProcessor;
  mockFrame: any;
  mockValidateGestureWithOpenAI: jest.MockedFunction<typeof validateGestureWithOpenAI>;
  mockShouldTriggerOpenAIValidation: jest.MockedFunction<typeof shouldTriggerOpenAIValidation>;
}

export interface PerformanceMetrics {
  totalTime: number;
  avgTimePerOperation: number;
  operationsPerSecond: number;
  successRate: number;
  errorRate: number;
}

/**
 * Create a standard test context with mocked services
 */
export function createTestContext(options: Partial<{
  enableParallelProcessing: boolean;
  confidenceThreshold: number;
  maxConcurrentRequests: number;
}> = {}): TestContext {
  const processor = new ParallelGestureProcessor(options);

  const mockFrame = {
    base64: 'mockBase64Data',
    uri: 'data:image/jpeg;base64,mockBase64Data',
    width: 640,
    height: 480,
    timestamp: Date.now(),
  };

  const mockValidateGestureWithOpenAI = validateGestureWithOpenAI as jest.MockedFunction<typeof validateGestureWithOpenAI>;
  const mockShouldTriggerOpenAIValidation = shouldTriggerOpenAIValidation as jest.MockedFunction<typeof shouldTriggerOpenAIValidation>;

  // Default mock implementations
  mockShouldTriggerOpenAIValidation.mockReturnValue(false);
  mockValidateGestureWithOpenAI.mockResolvedValue({
    success: true,
    gesture: 'thumbs_up',
    confidence: 0.8,
    feedback: 'Good gesture',
    quality_score: 8.0,
  });

  return {
    processor,
    mockFrame,
    mockValidateGestureWithOpenAI,
    mockShouldTriggerOpenAIValidation,
  };
}

/**
 * Clean up test context resources
 */
export function cleanupTestContext(context: TestContext): void {
  context.processor.cleanup();
  jest.clearAllMocks();
}

/**
 * Generate a sequence of gestures with realistic timing
 */
export function generateRealisticGestureSequence(
  fixture: RealisticGestureFixture,
  length: number = 10,
  variationType: 'tremor' | 'partial' | 'urgent' = 'tremor',
  frameInterval: number = 100
): Array<{
  landmarks: number[][][];
  handedness: string[];
  delay: number;
  expectedGesture: string;
  confidence: number;
}> {
  const sequence = generateGestureSequence(fixture, length, variationType);

  return sequence.map((frame, index) => ({
    landmarks: frame,
    handedness: fixture.handedness,
    delay: index * frameInterval,
    expectedGesture: fixture.expectedGesture,
    confidence: fixture.confidence - (Math.random() * 0.1), // Add slight confidence variation
  }));
}

/**
 * Simulate battery conditions by adding processing delays
 */
export function simulateBatteryConditions(batteryLevel: number): {
  delayMultiplier: number;
  shouldThrottle: boolean;
  recommendedFrameRate: number;
} {
  if (batteryLevel > 80) {
    return { delayMultiplier: 1.0, shouldThrottle: false, recommendedFrameRate: 30 };
  } else if (batteryLevel > 50) {
    return { delayMultiplier: 1.2, shouldThrottle: false, recommendedFrameRate: 25 };
  } else if (batteryLevel > 20) {
    return { delayMultiplier: 1.5, shouldThrottle: true, recommendedFrameRate: 20 };
  } else {
    return { delayMultiplier: 2.0, shouldThrottle: true, recommendedFrameRate: 15 };
  }
}

/**
 * Process a gesture sequence with battery simulation
 */
export async function processGestureSequenceWithBatterySimulation(
  context: TestContext,
  sequence: Array<{
    landmarks: number[][][];
    handedness: string[];
    delay: number;
    expectedGesture: string;
    confidence: number;
  }>,
  batteryLevel: number = 100
): Promise<Array<{
  result: any;
  processingTime: number;
  batteryDelay: number;
}>> {
  const batteryConditions = simulateBatteryConditions(batteryLevel);
  const results = [];

  for (const frame of sequence) {
    const startTime = Date.now();

    // Add battery-induced delay
    const batteryDelay = frame.delay * batteryConditions.delayMultiplier;
    if (batteryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, batteryDelay));
    }

    const result = await context.processor.processMediaPipeResult(
      frame.expectedGesture,
      frame.confidence,
      frame.landmarks,
      frame.handedness,
      false
    );

    const processingTime = Date.now() - startTime;

    results.push({
      result,
      processingTime,
      batteryDelay,
    });
  }

  return results;
}

/**
 * Measure performance metrics for a test operation
 */
export async function measurePerformance<T>(
  operation: () => Promise<T>,
  iterations: number = 1
): Promise<PerformanceMetrics> {
  const startTime = Date.now();
  const results: T[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < iterations; i++) {
    try {
      const result = await operation();
      results.push(result);
    } catch (error) {
      errors.push(error as Error);
    }
  }

  const totalTime = Date.now() - startTime;
  const avgTimePerOperation = totalTime / iterations;
  const operationsPerSecond = iterations / (totalTime / 1000);
  const successRate = results.length / iterations;
  const errorRate = errors.length / iterations;

  return {
    totalTime,
    avgTimePerOperation,
    operationsPerSecond,
    successRate,
    errorRate,
  };
}

/**
 * Assert performance requirements for Amy First principles
 */
export function assertAmyFirstPerformance(metrics: PerformanceMetrics, requirements: {
  maxAvgTime?: number;
  minSuccessRate?: number;
  maxErrorRate?: number;
  minOpsPerSecond?: number;
} = {}): void {
  const {
    maxAvgTime = 50, // 50ms average
    minSuccessRate = 0.8, // 80% success rate
    maxErrorRate = 0.1, // 10% error rate
    minOpsPerSecond = 15, // 15 ops/second
  } = requirements;

  expect(metrics.avgTimePerOperation).toBeLessThan(maxAvgTime);
  expect(metrics.successRate).toBeGreaterThan(minSuccessRate);
  expect(metrics.errorRate).toBeLessThan(maxErrorRate);
  expect(metrics.operationsPerSecond).toBeGreaterThan(minOpsPerSecond);
}

/**
 * Create a mock emergency gesture scenario
 */
export function createEmergencyScenario(
  baseFixture: RealisticGestureFixture,
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical' = 'high'
): RealisticGestureFixture {
  const urgencyMultipliers = {
    low: 1.1,
    medium: 1.3,
    high: 1.6,
    critical: 2.0,
  };

  const multiplier = urgencyMultipliers[urgencyLevel];

  return {
    ...baseFixture,
    name: `${baseFixture.name}_emergency_${urgencyLevel}`,
    gesture: baseFixture.gesture,
    confidence: Math.min(0.95, baseFixture.confidence * multiplier),
    isEmergency: true,
    description: `${baseFixture.description} (Emergency - ${urgencyLevel} urgency)`,
  };
}

/**
 * Simulate network conditions for OpenAI validation
 */
export function simulateNetworkConditions(
  context: TestContext,
  conditions: 'excellent' | 'good' | 'poor' | 'offline' = 'good'
): void {
  const networkConfigs = {
    excellent: { delay: 50, failureRate: 0.01 },
    good: { delay: 150, failureRate: 0.05 },
    poor: { delay: 500, failureRate: 0.2 },
    offline: { delay: 0, failureRate: 1.0 },
  };

  const config = networkConfigs[conditions];

  context.mockValidateGestureWithOpenAI.mockImplementation(async () => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, config.delay));

    // Simulate network failures
    if (Math.random() < config.failureRate) {
      throw new Error('Network error');
    }

    return {
      success: true,
      gesture: 'thumbs_up',
      confidence: 0.8,
      feedback: 'Network validated gesture',
      quality_score: 8.0,
    };
  });
}

/**
 * Generate test data for 22q11 movement patterns
 */
export function generate22q11MovementPattern(
  baseGesture: string,
  severity: 'mild' | 'moderate' | 'severe' = 'moderate',
  duration: number = 1000 // milliseconds
): Array<{
  timestamp: number;
  landmarks: number[][][];
  confidence: number;
  tremorIntensity: number;
}> {
  const baseFixture = realisticGestureFixtures.find(f => f.gesture === baseGesture);
  if (!baseFixture) {
    throw new Error(`Gesture ${baseGesture} not found in fixtures`);
  }

  const tremorIntensities = {
    mild: 0.02,
    moderate: 0.05,
    severe: 0.08,
  };

  const intensity = tremorIntensities[severity];
  const frameCount = Math.floor(duration / 100); // 10 fps
  const pattern = [];

  for (let i = 0; i < frameCount; i++) {
    const timestamp = Date.now() + (i * 100);
    const tremorVariation = intensity * (0.5 + Math.sin(i * 0.5) * 0.5); // Oscillating tremor

    // Apply tremor to landmarks
    const tremoredLandmarks = baseFixture.landmarks[0].map(landmark => [
      landmark[0] + (Math.random() - 0.5) * tremorVariation,
      landmark[1] + (Math.random() - 0.5) * tremorVariation,
      landmark[2] + (Math.random() - 0.5) * tremorVariation * 0.5,
    ]);

    pattern.push({
      timestamp,
      landmarks: [tremoredLandmarks],
      confidence: baseFixture.confidence * (0.7 + Math.random() * 0.3), // Variable confidence
      tremorIntensity: tremorVariation,
    });
  }

  return pattern;
}

/**
 * Validate gesture detection results against expectations
 */
export function validateGestureResults(
  results: Array<{ result: any; expectedGesture: string }>,
  tolerance: {
    confidenceThreshold?: number;
    allowNullGestures?: boolean;
    maxConsecutiveFailures?: number;
  } = {}
): {
  successRate: number;
  avgConfidence: number;
  consecutiveFailures: number;
  isValid: boolean;
} {
  const {
    confidenceThreshold = 0.3,
    allowNullGestures = false,
    maxConsecutiveFailures = 3,
  } = tolerance;

  let consecutiveFailures = 0;
  let maxConsecutiveFailuresFound = 0;
  const validResults = [];

  for (const { result, expectedGesture } of results) {
    const isCorrect = result.gesture === expectedGesture;
    const isConfident = result.confidence >= confidenceThreshold;
    const isValid = isCorrect && (isConfident || (allowNullGestures && result.gesture === null));

    if (isValid) {
      consecutiveFailures = 0;
      validResults.push(result);
    } else {
      consecutiveFailures++;
      maxConsecutiveFailuresFound = Math.max(maxConsecutiveFailuresFound, consecutiveFailures);
    }
  }

  const successRate = validResults.length / results.length;
  const avgConfidence = validResults.reduce((sum, r) => sum + r.confidence, 0) / validResults.length;

  return {
    successRate,
    avgConfidence: avgConfidence || 0,
    consecutiveFailures: maxConsecutiveFailuresFound,
    isValid: maxConsecutiveFailuresFound <= maxConsecutiveFailures && successRate >= 0.7,
  };
}

/**
 * Create a comprehensive test suite for a gesture fixture
 */
export function createGestureTestSuite(
  fixture: RealisticGestureFixture,
  context: TestContext
): {
  testBasicDetection: () => Promise<void>;
  testTremorResistance: () => Promise<void>;
  testEmergencyPriority: () => Promise<void>;
  testPerformanceUnderLoad: () => Promise<void>;
} {
  return {
    testBasicDetection: async () => {
      const result = await context.processor.processMediaPipeResult(
        fixture.gesture,
        fixture.confidence,
        fixture.landmarks,
        fixture.handedness,
        fixture.isEmergency
      );

      expect(result.gesture).toBe(fixture.expectedGesture);
      expect(result.confidence).toBe(fixture.confidence);
      expect(result.source).toBe('mediapipe');
    },

    testTremorResistance: async () => {
      if (fixture.variations?.tremor) {
        const result = await context.processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.variations.tremor,
          fixture.handedness,
          fixture.isEmergency
        );

        expect(result.gesture).toBe(fixture.expectedGesture);
        expect(result.confidence).toBeGreaterThan(0.1);
      }
    },

    testEmergencyPriority: async () => {
      if (fixture.isEmergency) {
        const startTime = Date.now();
        const result = await context.processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        const processingTime = Date.now() - startTime;

        expect(result.emergency).toBe(true);
        expect(processingTime).toBeLessThan(100);
      }
    },

    testPerformanceUnderLoad: async () => {
      const iterations = 20;
      const results = [];

      for (let i = 0; i < iterations; i++) {
        const result = await context.processor.processMediaPipeResult(
          fixture.gesture,
          fixture.confidence,
          fixture.landmarks,
          fixture.handedness,
          fixture.isEmergency
        );
        results.push(result);
      }

      const avgTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
      expect(avgTime).toBeLessThan(50);
      expect(results.every(r => r.gesture === fixture.expectedGesture)).toBe(true);
    },
  };
}