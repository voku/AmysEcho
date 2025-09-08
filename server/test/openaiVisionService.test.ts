/**
 * Tests for OpenAI Vision Service
 */

import { validateGestureWithVision, isVisionServiceAvailable, getVisionServiceHealth } from '../src/services/openaiVisionService';

// Mock OpenAI
jest.mock('openai', () => {
  const responses = { create: jest.fn() };
  return jest.fn().mockImplementation(() => ({ responses }));
});

describe('OpenAI Vision Service', () => {
  let mockOpenAI: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    delete process.env.OPENAI_API_KEY;

    // Get the mocked OpenAI instance
    const OpenAIMock = require('openai');
    mockOpenAI = new OpenAIMock();
  });

  describe('isVisionServiceAvailable', () => {
    it('should return false when API key is not set', async () => {
      const result = await isVisionServiceAvailable();
      expect(result).toBe(false);
    });

    it('should return true when API key is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const result = await isVisionServiceAvailable();
      expect(result).toBe(true);
    });
  });

  describe('getVisionServiceHealth', () => {
    it('should return unavailable when API key is missing', async () => {
      const result = await getVisionServiceHealth();
      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return available when API key is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const result = await getVisionServiceHealth();
      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('validateGestureWithVision', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-key';
    });

    it('should successfully validate a gesture', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
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
        }),
      } as any;

      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
        expectedGesture: 'hello',
      });

      expect(result.primary_gesture.gesture).toBe('hello');
      expect(result.primary_gesture.confidence).toBe(0.85);
      expect(result.primary_gesture.feedback).toBe('Clear gesture execution');
      expect(result.primary_gesture.quality_score).toBe(8.5);
      expect(result.primary_gesture.suggestions).toEqual(['Keep hand steady']);
      expect(result.overall_confidence).toBe(0.85);
      expect(result.processing_time_ms).toBeGreaterThan(0);
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAI.responses.create.mockRejectedValue(new Error('API Error'));

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
      });

      expect(result.primary_gesture.gesture).toBe('unknown');
      expect(result.primary_gesture.confidence).toBe(0);
      expect(result.primary_gesture.feedback).toBe('Unable to analyze gesture image');
      expect(result.primary_gesture.quality_score).toBe(0);
      expect(result.overall_confidence).toBe(0);
      expect(result.processing_time_ms).toBeGreaterThan(0);
    });

    it('should handle malformed API responses', async () => {
      const mockResponse = { output_text: 'Invalid JSON response' } as any;
      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
      });

      expect(result.primary_gesture.gesture).toBe('unknown');
      expect(result.primary_gesture.confidence).toBe(0);
    });

    it('should validate response data types and ranges', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'hello',
            confidence: 1.5,
            feedback: 'Good gesture',
            quality_score: 15,
            suggestions: ['Tip 1', 'Tip 2'],
            landmarks_detected: true,
            hand_count: 3,
          },
          alternative_gestures: [],
          overall_confidence: 0.8,
        }),
      } as any;
      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
      });

      expect(result.primary_gesture.confidence).toBe(1.0); // Clamped to max
      expect(result.primary_gesture.quality_score).toBe(10); // Clamped to max
      expect(result.primary_gesture.hand_count).toBe(2); // Clamped to max
    });

    it('should include context information in prompt', async () => {
      const mockResponse = { output_text: JSON.stringify({
        primary_gesture: {
          gesture: 'hello', confidence: 0.8, feedback: 'Good morning greeting', quality_score: 8.0,
          landmarks_detected: true, hand_count: 1,
        }, alternative_gestures: [], overall_confidence: 0.8,
      }) } as any;

      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      await validateGestureWithVision({
        imageBase64: 'test-image-data',
        expectedGesture: 'hello',
        context: { environment: 'home', session_id: 'test-session' },
      });

      const callArgs = mockOpenAI.responses.create.mock.calls[0][0];
      const content = callArgs.input[0].content;
      const textItem = content.find((c: any) => c.type === 'input_text');
      expect(textItem.text).toContain('Environment: home');
    });

    it('should handle empty API response', async () => {
      const mockResponse = { output_text: '' } as any;
      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      const result = await validateGestureWithVision({ imageBase64: 'test-image-data' });
      expect(result.primary_gesture.gesture).toBe('unknown');
      expect(result.primary_gesture.confidence).toBe(0);
    });
  });
});
