/**
 * Integration Tests for OpenAI Vision Service
 *
 * Tests the complete OpenAI Vision integration including:
 * - API endpoint functionality
 * - Service integration
 * - Error handling
 * - Rate limiting
 * - Authentication
 */

import request from 'supertest';
import express from 'express';
import { validateGestureWithVision } from '../../src/services/openaiVisionService';

// Mock OpenAI
jest.mock('openai', () => {
  const responses = { create: jest.fn() };
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ responses })),
  };
});

// Mock auth middleware
jest.mock('../../src/middleware/auth', () => ({
  legacyAuth: (req: any, res: any, next: any) => next(),
}));

describe('OpenAI Vision Integration', () => {
  let app: express.Application;
  let mockOpenAI: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up test environment
    process.env.OPENAI_API_KEY = 'test-key';

    // Create test app
    app = express();
    app.use(express.json({ limit: '8mb' }));

    // Mock the OpenAI instance
    const { default: OpenAIMock } = require('openai');
    mockOpenAI = new OpenAIMock();

    // Add the validation endpoint
    app.post('/api/gesture/validate-vision', require('../../src/middleware/auth').legacyAuth, async (req: any, res: any) => {
      try {
        const Body = require('zod').object({
          imageBase64: require('zod').string().min(1),
          expectedGesture: require('zod').string().optional(),
          mediapipeConfidence: require('zod').number().optional(),
          context: require('zod').object({
            user_id: require('zod').string().optional(),
            session_id: require('zod').string().optional(),
            previous_gestures: require('zod').array(require('zod').string()).optional(),
            environment: require('zod').enum(['home', 'school', 'therapy']).optional(),
          }).optional(),
          options: require('zod').object({
            detailed_feedback: require('zod').boolean().optional(),
            include_alternatives: require('zod').boolean().optional(),
            confidence_threshold: require('zod').number().optional(),
          }).optional(),
        });

        const parsed = Body.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Invalid request format',
            details: parsed.error.flatten()
          });
        }

        const { imageBase64, expectedGesture, context, options } = parsed.data;

        const result = await validateGestureWithVision({
          imageBase64,
          expectedGesture,
          context,
          options,
        });

        res.json(result);

      } catch (error: any) {
        console.error('OpenAI validation endpoint error:', error);
        res.status(500).json({
          error: 'Gesture validation failed',
          details: error.message
        });
      }
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('API Endpoint Integration', () => {
    it('should successfully validate gesture through API endpoint', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'hello', confidence: 0.85, feedback: 'Clear gesture execution', quality_score: 8.5,
            suggestions: ['Keep hand steady'], landmarks_detected: true, hand_count: 1,
          }, alternative_gestures: [], overall_confidence: 0.85,
        }),
      } as any;

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
          expectedGesture: 'hello',
          mediapipeConfidence: 0.7,
          context: {
            environment: 'home',
            session_id: 'test-session',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('hello');
      expect(response.body.primary_gesture.confidence).toBe(0.85);
      expect(response.body.primary_gesture.feedback).toBe('Clear gesture execution');
      expect(response.body.primary_gesture.quality_score).toBe(8.5);
      expect(response.body.primary_gesture.suggestions).toEqual(['Keep hand steady']);
      expect(response.body.overall_confidence).toBe(0.85);
      expect(response.body.processing_time_ms).toBeGreaterThan(0);
    });

    it('should handle API validation errors gracefully', async () => {
      mockOpenAI.responses.create.mockRejectedValue(new Error('OpenAI API Error'));

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200); // Should return fallback result, not error
      expect(response.body.primary_gesture.gesture).toBe('unknown');
      expect(response.body.primary_gesture.confidence).toBe(0);
      expect(response.body.primary_gesture.feedback).toBe('Unable to analyze gesture image');
      expect(response.body.primary_gesture.quality_score).toBe(0);
      expect(response.body.overall_confidence).toBe(0);
    });

    it('should validate request format', async () => {
      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          // Missing required imageBase64
          expectedGesture: 'hello',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request format');
      expect(response.body.details).toBeDefined();
    });

    it('should handle large base64 images', async () => {
      const largeImageData = 'a'.repeat(1024 * 1024); // 1MB of data

      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'hello', confidence: 0.8, feedback: 'Good gesture', quality_score: 8.0,
            landmarks_detected: true, hand_count: 1,
          }, alternative_gestures: [], overall_confidence: 0.8,
        }),
      } as any;

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: largeImageData,
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('hello');
    });

    it('should include context in OpenAI prompt', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'hello', confidence: 0.8, feedback: 'Good morning greeting', quality_score: 8.0,
            landmarks_detected: true, hand_count: 1,
          }, alternative_gestures: [], overall_confidence: 0.8,
        }),
      } as any;

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
          expectedGesture: 'hello',
          context: {
            environment: 'school',
            user_id: 'test-user',
            previous_gestures: ['thank_you', 'please'],
          },
        });

      const callArgs = mockOpenAI.responses.create.mock.calls[0][0];
      const prompt = callArgs.input[0].content.find((c: any) => c.type === 'input_text').text;

      expect(prompt).toContain('Expected gesture: hello');
      expect(prompt).toContain('Environment: school');
      expect(prompt).toContain('previous_gestures');
    });
  });

  describe('Service Integration', () => {
    it('should integrate with OpenAI Vision service correctly', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'thank_you', confidence: 0.9, feedback: 'Excellent gesture execution', quality_score: 9.5,
            suggestions: [], landmarks_detected: true, hand_count: 2,
          }, alternative_gestures: [
            { gesture: 'please', confidence: 0.6, feedback: 'Similar but different hand position', quality_score: 7.0, landmarks_detected: true, hand_count: 2 }
          ], overall_confidence: 0.9,
        }),
      } as any;

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
        expectedGesture: 'thank_you',
        context: {
          environment: 'therapy',
        },
      });

      expect(result.primary_gesture.gesture).toBe('thank_you');
      expect(result.primary_gesture.confidence).toBe(0.9);
      expect(result.primary_gesture.hand_count).toBe(2);
      expect(result.alternative_gestures).toHaveLength(1);
      expect(result.alternative_gestures[0].gesture).toBe('please');
      expect(result.overall_confidence).toBe(0.9);
    });

    it('should handle OpenAI service unavailability', async () => {
      // Remove API key to simulate unavailability
      delete process.env.OPENAI_API_KEY;

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
      });

      expect(result.primary_gesture.gesture).toBe('unknown');
      expect(result.primary_gesture.confidence).toBe(0);
      expect(result.primary_gesture.feedback).toBe('Unable to analyze gesture image');
    });

    it('should validate response data ranges', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'hello', confidence: 1.5, feedback: 'Good gesture', quality_score: -5,
            suggestions: ['Tip 1'], landmarks_detected: true, hand_count: 5,
          }, alternative_gestures: [], overall_confidence: 0.8,
        }),
      } as any;

      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
      });

      expect(result.primary_gesture.confidence).toBe(1.0); // Clamped to max
      expect(result.primary_gesture.quality_score).toBe(0); // Clamped to min
      expect(result.primary_gesture.hand_count).toBe(2); // Clamped to max
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle malformed JSON responses', async () => {
      const mockResponse = { output_text: 'This is not JSON' } as any;
      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('unknown');
      expect(response.body.primary_gesture.confidence).toBe(0);
    });

    it('should handle empty API responses', async () => {
      const mockResponse = { output_text: '' } as any;
      mockOpenAI.responses.create.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('unknown');
    });

    it('should handle network timeouts', async () => {
      mockOpenAI.responses.create.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 35000)) // Longer than timeout
      );

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({ imageBase64: 'test-image-data' });

      expect(response.status).toBe(200); // Should still return fallback
      expect(response.body.primary_gesture.gesture).toBe('unknown');
    });
  });
});
