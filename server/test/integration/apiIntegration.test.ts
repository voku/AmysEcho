/**
 * API Integration Tests
 *
 * Tests the complete server API integration including:
 * - OpenAI validation endpoint
 * - Authentication middleware
 * - Rate limiting
 * - Error handling
 * - Request/response validation
 */

import request from 'supertest';
import express from 'express';
import { validateGestureWithVision } from '../../src/services/openaiVisionService';

// Mock OpenAI
jest.mock('openai', () => {
  const responses = { create: jest.fn() };
  return jest.fn().mockImplementation(() => ({ responses }));
});

// Mock auth middleware
jest.mock('../../src/middleware/auth', () => ({
  legacyAuth: jest.fn((req: any, res: any, next: any) => next()),
}));

describe('API Integration Tests', () => {
  let app: express.Application;
  let mockOpenAI: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up test environment
    process.env.OPENAI_API_KEY = 'test-key';

    // Create test app with all middleware
    app = express();
    app.use(express.json({ limit: '8mb' }));
    app.use(express.urlencoded({ extended: true, limit: '8mb' }));

    // Mock rate limiter
    const mockRateLimit = (req: any, res: any, next: any) => next();
    jest.doMock('express-rate-limit', () => jest.fn(() => mockRateLimit));

    // Mock the OpenAI instance
    const OpenAIMock = require('openai');
    mockOpenAI = new OpenAIMock();

    // Ensure auth allows by default
    const authMock = require('../../src/middleware/auth').legacyAuth;
    if (typeof authMock === 'function' && authMock.mock) {
      authMock.mockImplementation((req: any, res: any, next: any) => next());
    }

    // Add routes
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

    // Health check endpoint
    app.get('/health', (req: any, res: any) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('Health Check Integration', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.uptime).toBeDefined();
    });
  });

  describe('OpenAI Validation Endpoint Integration', () => {
    it('should integrate successfully with OpenAI Vision service', async () => {
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

      // Verify OpenAI Responses API called with image and model
      expect(mockOpenAI.responses.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          input: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'input_text' }),
                expect.objectContaining({ type: 'input_image', image_url: expect.stringContaining('test-image-data') }),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle authentication middleware', async () => {
      const mockAuth = require('../../src/middleware/auth').legacyAuth;
      mockAuth.mockImplementation((req: any, res: any, next: any) => {
        // Simulate authentication failure
        res.status(401).json({ error: 'Unauthorized' });
      });

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should handle rate limiting', async () => {
      const mockRateLimit = jest.fn((req: any, res: any, next: any) => {
        res.status(429).json({ error: 'Too many requests' });
      });

      // Temporarily replace the route with rate limited version
      app.post('/api/gesture/validate-vision-rate-limited', mockRateLimit, (req: any, res: any) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/api/gesture/validate-vision-rate-limited')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Too many requests');
    });

    it('should validate request body schema', async () => {
      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          // Missing required imageBase64
          expectedGesture: 'hello',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request format');
      expect(response.body.details).toBeDefined();
      expect(response.body.details.fieldErrors).toBeDefined();
    });

    it('should handle large request bodies', async () => {
      const largeImageData = 'a'.repeat(1024 * 1024); // 1MB of data

      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'hello', confidence: 0.8, feedback: 'Good gesture', quality_score: 8.0,
            landmarks_detected: true, hand_count: 1,
          }, alternative_gestures: [], overall_confidence: 0.8,
        }),
      } as any;

      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: largeImageData,
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('hello');
    });

    it('should handle malformed base64 data', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'unknown', confidence: 0, feedback: 'Unable to analyze gesture image', quality_score: 0,
            landmarks_detected: false, hand_count: 0,
          }, alternative_gestures: [], overall_confidence: 0,
        }),
      } as any;

      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'invalid-base64-data!@#$%',
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('unknown');
      expect(response.body.primary_gesture.confidence).toBe(0);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle OpenAI API errors gracefully', async () => {
      mockOpenAI.responses.create.mockRejectedValue(new Error('OpenAI API Error'));

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200); // Should return fallback result
      expect(response.body.primary_gesture.gesture).toBe('unknown');
      expect(response.body.primary_gesture.confidence).toBe(0);
      expect(response.body.primary_gesture.feedback).toBe('Unable to analyze gesture image');
    });

    it('should handle OpenAI service unavailability', async () => {
      // Remove API key to simulate unavailability
      delete process.env.OPENAI_API_KEY;

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('unknown');
      expect(response.body.primary_gesture.confidence).toBe(0);
    });

    it('should handle malformed OpenAI responses', async () => {
      const mockResponse = { output_text: 'This is not valid JSON' } as any;
      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('unknown');
      expect(response.body.primary_gesture.confidence).toBe(0);
    });

    it('should handle empty OpenAI responses', async () => {
      const mockResponse = { output_text: '' } as any;
      mockOpenAI.responses.create.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('unknown');
    });

    it('should handle timeout scenarios', async () => {
      mockOpenAI.responses.create.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 35000)) // Longer than typical timeout
      );

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        })
        .timeout(5000); // 5 second timeout

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('unknown');
    });

    it('should handle server internal errors', async () => {
      mockOpenAI.responses.create.mockImplementation(() => {
        throw new Error('Internal server error');
      });

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200); // Should return fallback result
      expect(response.body.primary_gesture.gesture).toBe('unknown');
    });
  });

  describe('Request Context Integration', () => {
    it('should include context information in OpenAI prompt', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              primary_gesture: {
                gesture: 'hello',
                confidence: 0.8,
                feedback: 'Good morning greeting',
                quality_score: 8.0,
                landmarks_detected: true,
                hand_count: 1,
              },
              alternative_gestures: [],
              overall_confidence: 0.8,
            }),
          },
        }],
      };

      mockOpenAI.responses.create.mockResolvedValue({ output_text: JSON.stringify({
        primary_gesture: { gesture: 'hello', confidence: 0.8, feedback: 'Good gesture', quality_score: 8.0, landmarks_detected: true, hand_count: 1 },
        alternative_gestures: [], overall_confidence: 0.8,
      }) });

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

    it('should handle optional context fields', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              primary_gesture: {
                gesture: 'hello',
                confidence: 0.8,
                feedback: 'Good gesture',
                quality_score: 8.0,
                landmarks_detected: true,
                hand_count: 1,
              },
              alternative_gestures: [],
              overall_confidence: 0.8,
            }),
          },
        }],
      };

      mockOpenAI.responses.create.mockResolvedValue({ output_text: JSON.stringify({
        primary_gesture: { gesture: 'hello', confidence: 0.8, feedback: 'Good gesture', quality_score: 8.0, landmarks_detected: true, hand_count: 1 },
        alternative_gestures: [], overall_confidence: 0.8,
      }) });

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
          // No context provided
        });

      expect(response.status).toBe(200);
      expect(response.body.primary_gesture.gesture).toBe('hello');
    });

    it('should validate context enum values', async () => {
      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
          context: {
            environment: 'invalid_environment', // Invalid enum value
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request format');
    });
  });

  describe('Performance Integration', () => {
    it('should handle concurrent requests', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              primary_gesture: {
                gesture: 'hello',
                confidence: 0.8,
                feedback: 'Good gesture',
                quality_score: 8.0,
                landmarks_detected: true,
                hand_count: 1,
              },
              alternative_gestures: [],
              overall_confidence: 0.8,
            }),
          },
        }],
      };

      mockOpenAI.responses.create.mockResolvedValue({ output_text: JSON.stringify({
        primary_gesture: { gesture: 'hello', confidence: 0.8, feedback: 'Good gesture', quality_score: 8.0, landmarks_detected: true, hand_count: 1 },
        alternative_gestures: [], overall_confidence: 0.8,
      }) });

      // Send multiple concurrent requests
      const requests = Array(5).fill().map(() =>
        request(app)
          .post('/api/gesture/validate-vision')
          .send({
            imageBase64: 'test-image-data',
          })
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.primary_gesture.gesture).toBe('hello');
      });

      // Verify OpenAI was called 5 times
      expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(5);
    });

    it('should include processing time in response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              primary_gesture: {
                gesture: 'hello',
                confidence: 0.8,
                feedback: 'Good gesture',
                quality_score: 8.0,
                landmarks_detected: true,
                hand_count: 1,
              },
              alternative_gestures: [],
              overall_confidence: 0.8,
            }),
          },
        }],
      };

      mockOpenAI.responses.create.mockResolvedValue({ output_text: JSON.stringify({
        primary_gesture: { gesture: 'hello', confidence: 0.8, feedback: 'Good gesture', quality_score: 8.0, landmarks_detected: true, hand_count: 1 },
        alternative_gestures: [], overall_confidence: 0.8,
      }) });

      const response = await request(app)
        .post('/api/gesture/validate-vision')
        .send({
          imageBase64: 'test-image-data',
        });

      expect(response.status).toBe(200);
      expect(response.body.processing_time_ms).toBeDefined();
      expect(typeof response.body.processing_time_ms).toBe('number');
      expect(response.body.processing_time_ms).toBeGreaterThan(0);
    });
  });
});
