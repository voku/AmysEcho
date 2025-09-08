/**
 * ParallelGestureProcessor emergency behavior under load
 *
 * Focus: Real Amy use-cases where bursts happen (kitchen/kindergarten)
 * Ensures emergency results return immediately even with in-flight OpenAI tasks.
 */

import { ParallelGestureProcessor } from '../../src/services/parallelGestureProcessor';

// Use the real image utils, but mock OpenAI validation to simulate slow network
jest.mock('../../src/services/openaiGestureValidationService', () => ({
  validateGestureWithOpenAI: jest.fn(),
  shouldTriggerOpenAIValidation: jest.fn(() => true),
}));

import { validateGestureWithOpenAI } from '../../src/services/openaiGestureValidationService';

describe('ParallelGestureProcessor - Emergency under burst load', () => {
  let processor: ParallelGestureProcessor;
  const mockFrame = {
    base64: 'burstBase64',
    uri: 'data:image/jpeg;base64,burstBase64',
    width: 640,
    height: 480,
    timestamp: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new ParallelGestureProcessor({ maxConcurrentRequests: 2 });
  });

  it('returns emergency MediaPipe result immediately despite backlog', async () => {
    // Slow down OpenAI validations to create a backlog
    (validateGestureWithOpenAI as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true, gesture: 'thumbs_up', confidence: 0.8 }), 200))
    );

    // Kick off a burst of non-emergency frames that will all request OpenAI
    const nonEmergencyPromises = Array.from({ length: 5 }).map(() =>
      processor.processMediaPipeResult('hello', 0.4, [[[0.5, 0.5, 0.8]]], ['Right'], false, mockFrame)
    );

    // Now process an emergency gesture
    const t0 = Date.now();
    const emergencyResult = await processor.processMediaPipeResult('help', 0.9, [[[0.5, 0.5, 0.8]]], ['Right'], true, mockFrame);
    const elapsed = Date.now() - t0;

    expect(emergencyResult.emergency).toBe(true);
    // Should return very quickly (does not wait for OpenAI)
    expect(elapsed).toBeLessThan(50);

    // Optional: allow background tasks to make progress to avoid open handles
    await new Promise((r) => setTimeout(r, 50));

    // Drain burst to avoid open handles
    await Promise.allSettled(nonEmergencyPromises);
  });
});
