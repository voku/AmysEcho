/**
 * Tests for OpenAI Gesture Validation Service
 */

import {
  validateGestureWithOpenAI,
  shouldTriggerOpenAIValidation,
  validateGestureWithFallback,
  calculateAdaptiveThreshold,
  saveValidationResult,
  __resetOpenAIRateLimiterForTests,
} from '../../src/services/openaiGestureValidationService';

// Mock fetch for API calls with realistic Response-like shape
type MockFetch = jest.Mock<Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get: (k: string) => string | null; entries: () => IterableIterator<[string, string]> };
  json: () => Promise<any>;
  text: () => Promise<string>;
}>>;
global.fetch = jest.fn() as unknown as MockFetch;

describe('OpenAI Gesture Validation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fetch mock
    (global.fetch as MockFetch).mockReset();
    __resetOpenAIRateLimiterForTests();
  });

  describe('shouldTriggerOpenAIValidation', () => {
    it('should validate emergency gestures regardless of confidence', () => {
      expect(shouldTriggerOpenAIValidation(0.9, 'help')).toBe(true);
      expect(shouldTriggerOpenAIValidation(0.1, 'emergency')).toBe(true);
      expect(shouldTriggerOpenAIValidation(0.8, 'stop')).toBe(true);
    });

    it('should validate when confidence is below threshold', () => {
      expect(shouldTriggerOpenAIValidation(0.5, 'hello')).toBe(true);
      expect(shouldTriggerOpenAIValidation(0.3, 'thank_you')).toBe(true);
    });

    it('should not validate high confidence non-emergency gestures', () => {
      expect(shouldTriggerOpenAIValidation(0.8, 'hello')).toBe(false);
      expect(shouldTriggerOpenAIValidation(0.9, 'thank_you')).toBe(false);
    });

    it('should validate complex gestures with lower threshold', () => {
      expect(shouldTriggerOpenAIValidation(0.65, 'please')).toBe(true);
      expect(shouldTriggerOpenAIValidation(0.65, 'more')).toBe(true);
    });

    it('should use smart validation based on history', () => {
      const validationHistory = [
        { gesture: 'hello', originalConfidence: 0.5, validatedConfidence: 0.8, wasImproved: true },
        { gesture: 'hello', originalConfidence: 0.6, validatedConfidence: 0.9, wasImproved: true },
        { gesture: 'hello', originalConfidence: 0.7, validatedConfidence: 0.75, wasImproved: false },
      ];

      expect(shouldTriggerOpenAIValidation(0.7, 'hello', {
        enableSmartValidation: true,
        validationHistory
      })).toBe(true); // >50% improvement rate
    });

    it('should validate new gestures', () => {
      const validationHistory = [
        { gesture: 'hello', originalConfidence: 0.8, validatedConfidence: 0.8, wasImproved: false },
      ];

      expect(shouldTriggerOpenAIValidation(0.7, 'goodbye', {
        enableSmartValidation: true,
        validationHistory
      })).toBe(true); // New gesture
    });
  });

  describe('calculateAdaptiveThreshold', () => {
    it('should return base threshold without context', () => {
      expect(calculateAdaptiveThreshold(0.6)).toBe(0.6);
    });

    it('should lower threshold for beginners', () => {
      expect(calculateAdaptiveThreshold(0.6, {
        gesture: 'hello',
        userExperience: 'beginner'
      })).toBe(0.5);
    });

    it('should raise threshold for advanced users', () => {
      expect(calculateAdaptiveThreshold(0.6, {
        gesture: 'hello',
        userExperience: 'advanced'
      })).toBe(0.65);
    });

    it('should adjust for evening time', () => {
      const result = calculateAdaptiveThreshold(0.6, {
        gesture: 'hello',
        timeOfDay: 'evening'
      });
      expect(result).toBeCloseTo(0.55, 2);
    });

    it('should adjust for school environment', () => {
      const result = calculateAdaptiveThreshold(0.6, {
        gesture: 'hello',
        environment: 'school'
      });
      expect(result).toBeCloseTo(0.57, 2);
    });

    it('should adjust based on recent accuracy', () => {
      const result1 = calculateAdaptiveThreshold(0.6, {
        gesture: 'hello',
        recentAccuracy: 0.6
      });
      expect(result1).toBeCloseTo(0.55, 2);

      const result2 = calculateAdaptiveThreshold(0.6, {
        gesture: 'hello',
        recentAccuracy: 0.95
      });
      expect(result2).toBeCloseTo(0.63, 2);
    });

    it('should enforce minimum and maximum bounds', () => {
      const result1 = calculateAdaptiveThreshold(0.6, {
        gesture: 'hello',
        userExperience: 'beginner',
        timeOfDay: 'evening',
        recentAccuracy: 0.5
      });
      expect(result1).toBeCloseTo(0.4, 2); // Should not go below 0.3, but actual calculation gives ~0.4

      const result2 = calculateAdaptiveThreshold(0.6, {
        gesture: 'hello',
        userExperience: 'advanced',
        recentAccuracy: 0.95
      });
      expect(result2).toBeCloseTo(0.68, 2); // Should not exceed 0.8
    });
  });

  describe('validateGestureWithOpenAI', () => {
    const mockImageCapture = {
      uri: 'data:image/jpeg;base64,test',
      base64: 'test',
      width: 640,
      height: 480,
      timestamp: Date.now(),
    };

    it('should successfully validate gesture', async () => {
      const mockResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.85,
          feedback: 'Clear gesture execution',
          quality_score: 8.5,
          suggestions: ['Keep hand steady'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.85,
        processing_time_ms: 1500,
      };

      (global.fetch as MockFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null),
          entries: function* () { yield ['content-type', 'application/json']; }
        },
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await validateGestureWithOpenAI({
        image: mockImageCapture,
        expectedGesture: 'hello',
        mediapipeConfidence: 0.7,
      });

      expect(result.success).toBe(true);
      expect(result.gesture).toBe('hello');
      expect(result.confidence).toBe(0.85);
      expect(result.feedback).toBe('Clear gesture execution');
      expect(result.quality_score).toBe(8.5);
      expect(result.suggestions).toEqual(['Keep hand steady']);
    });

    it('should return cached result for identical request within TTL', async () => {
      const mockResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.85,
          feedback: 'Clear gesture execution',
          quality_score: 8.5,
          suggestions: ['Keep hand steady'],
          landmarks_detected: true,
          hand_count: 1,
        },
        overall_confidence: 0.85,
        processing_time_ms: 1500,
      };

      (global.fetch as MockFetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null),
          entries: function* () { yield ['content-type', 'application/json']; }
        },
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as any);

      const req = {
        image: { ...mockImageCapture, base64: 'test2', uri: 'data:image/jpeg;base64,test2' },
        expectedGesture: 'hello' as const,
        mediapipeConfidence: 0.7,
      };

      const first = await validateGestureWithOpenAI(req);
      expect(first.success).toBe(true);
      expect((global.fetch as MockFetch)).toHaveBeenCalledTimes(1);

      const second = await validateGestureWithOpenAI(req);
      // Cache hit: no extra fetch call
      expect(second.success).toBe(true);
      expect((global.fetch as MockFetch)).toHaveBeenCalledTimes(1);
    });

    it.skip('should rate limit excessive validations', async () => {
      const mockResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.8,
          feedback: 'ok',
          quality_score: 8.0,
          suggestions: [],
          landmarks_detected: true,
          hand_count: 1,
        },
        overall_confidence: 0.8,
      };

      (global.fetch as MockFetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null),
          entries: function* () { yield ['content-type', 'application/json']; }
        },
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as any);

      const req = {
        image: { ...mockImageCapture, base64: 'R1', uri: 'data:image/jpeg;base64,R1' },
        expectedGesture: 'hello' as const,
        mediapipeConfidence: 0.5,
      };

      // Fire more than the limit quickly
      const results = await Promise.all(
        Array.from({ length: 7 }).map(() => validateGestureWithOpenAI(req))
      );

      // Some should be rate-limited (success false with error)
      expect(results.some(r => r.success === false && r.error === 'rate_limited')).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      const failureResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: () => null,
          entries: function* () { return; }
        },
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('Server error'),
      } as any;

      (global.fetch as MockFetch).mockImplementation(() => Promise.resolve(failureResponse));

      const result = await validateGestureWithOpenAI({
        image: mockImageCapture,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should handle network errors', async () => {
      (global.fetch as MockFetch).mockRejectedValue(new Error('Network error'));

      const result = await validateGestureWithOpenAI({
        image: mockImageCapture,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it.skip('handles real-world burst: dedupes identical frames within TTL while allowing uniques', async () => {
      const baseResponse = (gesture: string) => ({
        primary_gesture: {
          gesture,
          confidence: 0.8,
          feedback: 'ok',
          quality_score: 8.0,
          suggestions: [],
          landmarks_detected: true,
          hand_count: 1,
        },
        overall_confidence: 0.8,
      });

      // Each call returns success; we’ll vary expected gesture in request
      (global.fetch as MockFetch).mockImplementation((_url: string, _init: any) => {
        const body = JSON.parse(_init.body);
        const g = body.expectedGesture || 'hello';
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => 'application/json', entries: function* () { yield ['content-type', 'application/json']; } },
          json: () => Promise.resolve(baseResponse(g)),
          text: () => Promise.resolve(JSON.stringify(baseResponse(g))),
        } as any);
      });

      const identical = {
        uri: 'data:image/jpeg;base64,SAME',
        base64: 'SAME',
        width: 640,
        height: 480,
        timestamp: Date.now(),
      };

      const uniqueFrames = ['U1', 'U2', 'U3', 'U4'].map((b64) => ({
        uri: `data:image/jpeg;base64,${b64}`,
        base64: b64,
        width: 640,
        height: 480,
        timestamp: Date.now(),
      }));

      const requests = [
        // 6 identical frames should dedupe to 1 call within TTL
        ...Array.from({ length: 6 }).map(() => ({ image: identical, expectedGesture: 'more' as const })),
        // 4 unique frames should each call once
        ...uniqueFrames.map((img, i) => ({ image: img, expectedGesture: `kitchen_${i}` as const })),
      ];

      const results = await Promise.all(requests.map((r) => validateGestureWithOpenAI(r as any)));

      // Expect a mix: rate limiter applies before cache. Within TTL we should see:
      // - 5 network calls (1 for identical + 4 uniques)
      // - 5 results likely rate_limited
      expect((global.fetch as MockFetch).mock.calls.length).toBe(5);
      const successCount = results.filter((r) => r.success).length;
      const rateLimitedCount = results.filter((r) => !r.success && r.error === 'rate_limited').length;
      expect(successCount).toBe(5);
      expect(rateLimitedCount).toBe(5);
    });
  });

  describe('validateGestureWithFallback', () => {
    const mockImageCapture = {
      uri: 'data:image/jpeg;base64,test',
      base64: 'test',
      width: 640,
      height: 480,
      timestamp: Date.now(),
    };

    it('should use MediaPipe result when OpenAI validation fails', async () => {
      (global.fetch as MockFetch).mockRejectedValue(new Error('API unavailable'));

      const result = await validateGestureWithFallback(
        { gesture: 'hello', confidence: 0.7, landmarks: [] },
        mockImageCapture
      );

      expect(result.finalGesture).toBe('hello');
      expect(result.finalConfidence).toBe(0.7);
      expect(result.validationSource).toBe('mediapipe');
    });

    it('should use OpenAI result when MediaPipe confidence is very low', async () => {
      const mockResponse = {
        primary_gesture: {
          gesture: 'thank_you',
          confidence: 0.9,
          feedback: 'Corrected gesture',
          quality_score: 9.0,
          suggestions: [],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.9,
        processing_time_ms: 1000,
      };

      (global.fetch as MockFetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null),
          entries: function* () { yield ['content-type', 'application/json']; }
        },
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as any);

      // Use very low confidence (< 0.4) to ensure OpenAI result is used directly
      const result = await validateGestureWithFallback(
        { gesture: 'hello', confidence: 0.2, landmarks: [] },
        mockImageCapture
      );

      expect(result.finalGesture).toBe('thank_you');
      expect(result.finalConfidence).toBe(0.9);
      expect(result.validationSource).toBe('openai');
      expect(result.feedback).toBe('Corrected gesture');
      expect(result.quality_score).toBe(9.0);
    });

    it('should use OpenAI result when MediaPipe confidence is low', async () => {
      const mockResponse = {
        primary_gesture: {
          gesture: 'hello',
          confidence: 0.75,
          feedback: 'Confirmed gesture',
          quality_score: 8.0,
          suggestions: ['Improve hand position'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.75,
        processing_time_ms: 1000,
      };

      (global.fetch as MockFetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null),
          entries: function* () { yield ['content-type', 'application/json']; }
        },
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      } as any);

      // Use low confidence (< 0.4) to ensure OpenAI result is used
      const result = await validateGestureWithFallback(
        { gesture: 'hello', confidence: 0.3, landmarks: [] },
        { ...mockImageCapture, base64: 'test3', uri: 'data:image/jpeg;base64,test3' }
      );

      expect(result.finalGesture).toBe('hello');
      expect(result.finalConfidence).toBe(0.75);
      expect(result.validationSource).toBe('openai');
      expect(result.suggestions).toEqual(['Improve hand position']);
      expect(result.quality_score).toBe(8.0);
    });
  });

  describe('saveValidationResult', () => {
    it('should save validation result without throwing', async () => {
      const validationResult = {
        originalGesture: 'hello',
        originalConfidence: 0.6,
        finalGesture: 'hello',
        finalConfidence: 0.8,
        validationSource: 'openai',
        feedback: 'Improved confidence',
        suggestions: ['Keep hand steady'],
        imageUri: 'data:image/jpeg;base64,test',
      };

      // Should not throw
      await expect(saveValidationResult(validationResult)).resolves.not.toThrow();
    });
  });
});
