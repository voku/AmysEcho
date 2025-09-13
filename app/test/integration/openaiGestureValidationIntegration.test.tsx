import { validateGestureWithOpenAI, validateGestureWithFallback } from '../../src/services/openaiGestureValidationService';

declare const global: any;

const mockImage = {
  uri: 'data:image/jpeg;base64,test',
  base64: 'dGVzdA==',
  width: 640,
  height: 480,
  timestamp: Date.now(),
};

describe('OpenAI Gesture Validation Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Integration', () => {
    it('should integrate with API for gesture validation', async () => {
      const mockApiResponse = {
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

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockApiResponse),
        text: () => Promise.resolve(''),
      });

      const result = await validateGestureWithOpenAI({
        image: mockImage,
        expectedGesture: 'hello',
        mediapipeConfidence: 0.7,
      });

      expect(result.success).toBe(true);
      expect(result.gesture).toBe('hello');
      expect(result.confidence).toBe(0.85);
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
        headers: new Map([['content-type', 'text/plain']]),
      });

      const result = await validateGestureWithOpenAI({ image: mockImage });
      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await validateGestureWithOpenAI({ image: mockImage });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('Fallback Integration', () => {
    it('should use OpenAI result when available', async () => {
      const mediapipeResult = { gesture: 'hello', confidence: 0.55, landmarks: [] };
      const mockApiResponse = {
        primary_gesture: {
          gesture: 'thank_you',
          confidence: 0.9,
          feedback: 'Corrected gesture with better confidence',
          quality_score: 9,
          suggestions: ['Extend fingers fully'],
          landmarks_detected: true,
          hand_count: 1,
        },
        alternative_gestures: [],
        overall_confidence: 0.9,
        processing_time_ms: 1200,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve(mockApiResponse),
        text: () => Promise.resolve(''),
      });

      const result = await validateGestureWithFallback(mediapipeResult, mockImage);
      expect(result.finalGesture).toBe('thank_you');
      expect(result.finalConfidence).toBe(0.9);
      expect(result.validationSource).toBe('openai');
    });

    it('should fall back to MediaPipe on API failure', async () => {
      const mediapipeResult = { gesture: 'hello', confidence: 0.8, landmarks: [] };
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await validateGestureWithFallback(mediapipeResult, mockImage);
      expect(result.finalGesture).toBe('hello');
      expect(result.finalConfidence).toBe(0.8);
      expect(result.validationSource).toBe('mediapipe');
    });
  });
});
