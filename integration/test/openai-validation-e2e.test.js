/**
 * End-to-End Integration Tests for OpenAI Gesture Validation
 *
 * Tests the complete flow from React Native app through server API:
 * 1. App captures gesture image
 * 2. App sends image to server for validation
 * 3. Server processes with OpenAI Vision
 * 4. Server returns validation results
 * 5. App receives and displays results
 */

import request from 'supertest';
import express from 'express';

// Mock React Native components and services
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

describe('OpenAI Validation End-to-End', () => {
  let serverApp;
  let mockOpenAI;

  beforeAll(() => {
    // Set up test environment
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:5000';
    process.env.EXPO_PUBLIC_API_TOKEN = 'test-token';
  });

  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_TOKEN;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Create server app
    serverApp = express();
    serverApp.use(express.json({ limit: '8mb' }));

    // Mock auth middleware
    serverApp.use('/api/gesture/validate-vision', (req, res, next) => {
      // Simple auth check for testing
      const token = req.headers.authorization;
      if (!token || !token.includes('test-token')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    });

    // Mock the OpenAI instance
    const OpenAIMock = require('openai');
    mockOpenAI = new OpenAIMock();

    // Add the validation endpoint
    serverApp.post('/api/gesture/validate-vision', async (req, res) => {
      try {
        const { imageBase64, expectedGesture, context } = req.body;

        // Simulate OpenAI processing
        const mockResponse = {
          choices: [{
            message: {
              content: JSON.stringify({
                primary_gesture: {
                  gesture: expectedGesture || 'hello',
                  confidence: 0.85,
                  feedback: `Validated ${expectedGesture || 'hello'} gesture`,
                  quality_score: 8.5,
                  suggestions: ['Keep hand steady', 'Maintain good posture'],
                  landmarks_detected: true,
                  hand_count: context?.previous_gestures?.length > 1 ? 2 : 1,
                },
                alternative_gestures: [
                  {
                    gesture: 'thank_you',
                    confidence: 0.6,
                    feedback: 'Similar gesture detected',
                    quality_score: 7.0,
                    landmarks_detected: true,
                    hand_count: 1,
                  }
                ],
                overall_confidence: 0.85,
              }),
            },
          }],
        };

        mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

        // Call actual service
        const { validateGestureWithVision } = require('../../server/src/services/openaiVisionService');
        const result = await validateGestureWithVision({
          imageBase64,
          expectedGesture,
          context,
        });

        res.json(result);

      } catch (error) {
        console.error('E2E test error:', error);
        res.status(500).json({
          error: 'Test server error',
          details: error.message
        });
      }
    });
  });

  describe('Complete Validation Flow', () => {
    it('should complete full validation cycle from app to server and back', async () => {
      // Step 1: Simulate app capturing gesture image
      const gestureImage = {
        uri: 'data:image/jpeg;base64,test-image-data',
        base64: 'test-image-data',
        width: 640,
        height: 480,
        timestamp: Date.now(),
      };

      // Step 2: Simulate app calling validation service
      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const validationRequest = {
        image: gestureImage,
        expectedGesture: 'hello',
        mediapipeConfidence: 0.6,
        context: {
          session_id: 'e2e-test-session',
          environment: 'home',
          previous_gestures: ['thank_you'],
        },
      };

      // Step 3: Make actual API call to test server
      const result = await validateGestureWithOpenAI(validationRequest);

      // Step 4: Verify the complete response
      expect(result.success).toBe(true);
      expect(result.gesture).toBe('hello');
      expect(result.confidence).toBe(0.85);
      expect(result.feedback).toBe('Validated hello gesture');
      expect(result.quality_score).toBe(8.5);
      expect(result.suggestions).toEqual(['Keep hand steady', 'Maintain good posture']);

      // Step 5: Verify OpenAI was called with correct parameters
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4-vision-preview',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('Expected gesture: hello'),
              }),
              expect.objectContaining({
                type: 'image_url',
                image_url: expect.objectContaining({
                  url: expect.stringContaining('test-image-data'),
                }),
              }),
            ]),
          }),
        ]),
        max_tokens: 1000,
        temperature: 0.1,
      });
    });

    it('should handle authentication in e2e flow', async () => {
      // Test with invalid token
      process.env.EXPO_PUBLIC_API_TOKEN = 'invalid-token';

      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const result = await validateGestureWithOpenAI({
        image: {
          uri: 'data:image/jpeg;base64,test',
          base64: 'test',
          width: 640,
          height: 480,
          timestamp: Date.now(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');

      // Reset token
      process.env.EXPO_PUBLIC_API_TOKEN = 'test-token';
    });

    it('should handle network errors in e2e flow', async () => {
      // Change to invalid server URL
      process.env.EXPO_PUBLIC_API_URL = 'http://invalid-server:9999';

      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const result = await validateGestureWithOpenAI({
        image: {
          uri: 'data:image/jpeg;base64,test',
          base64: 'test',
          width: 640,
          height: 480,
          timestamp: Date.now(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Reset URL
      process.env.EXPO_PUBLIC_API_URL = 'http://localhost:5000';
    });
  });

  describe('Fallback Scenarios', () => {
    it('should fallback gracefully when OpenAI service fails', async () => {
      // Mock OpenAI to fail
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI service unavailable'));

      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const result = await validateGestureWithOpenAI({
        image: {
          uri: 'data:image/jpeg;base64,test',
          base64: 'test',
          width: 640,
          height: 480,
          timestamp: Date.now(),
        },
        expectedGesture: 'hello',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle server unavailability', async () => {
      // Temporarily change server URL to non-existent endpoint
      const originalUrl = process.env.EXPO_PUBLIC_API_URL;
      process.env.EXPO_PUBLIC_API_URL = 'http://localhost:9999';

      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const result = await validateGestureWithOpenAI({
        image: {
          uri: 'data:image/jpeg;base64,test',
          base64: 'test',
          width: 640,
          height: 480,
          timestamp: Date.now(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Restore original URL
      process.env.EXPO_PUBLIC_API_URL = originalUrl;
    });
  });

  describe('Data Flow Integration', () => {
    it('should maintain data integrity through the entire pipeline', async () => {
      const testData = {
        gesture: 'please',
        confidence: 0.7,
        context: {
          session_id: 'integrity-test-session',
          environment: 'therapy',
          previous_gestures: ['hello', 'thank_you'],
        },
        image: {
          uri: 'data:image/jpeg;base64,integrity-test-data',
          base64: 'integrity-test-data',
          width: 800,
          height: 600,
          timestamp: Date.now(),
        },
      };

      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const result = await validateGestureWithOpenAI({
        image: testData.image,
        expectedGesture: testData.gesture,
        mediapipeConfidence: testData.confidence,
        context: testData.context,
      });

      expect(result.success).toBe(true);
      expect(result.gesture).toBe(testData.gesture);

      // Verify that context was passed to OpenAI
      const openaiCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const prompt = openaiCall.messages[0].content[0].text;

      expect(prompt).toContain(`Expected gesture: ${testData.gesture}`);
      expect(prompt).toContain(`Environment: ${testData.context.environment}`);
      expect(prompt).toContain('previous_gestures');
    });

    it('should handle large images in e2e flow', async () => {
      // Create a large base64 string (simulating a real image)
      const largeImageData = 'a'.repeat(1024 * 100); // ~100KB of data

      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const result = await validateGestureWithOpenAI({
        image: {
          uri: `data:image/jpeg;base64,${largeImageData}`,
          base64: largeImageData,
          width: 1024,
          height: 768,
          timestamp: Date.now(),
        },
        expectedGesture: 'hello',
      });

      expect(result.success).toBe(true);
      expect(result.gesture).toBe('hello');

      // Verify the large image was sent correctly
      const openaiCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const imageUrl = openaiCall.messages[0].content[1].image_url.url;
      expect(imageUrl).toContain(largeImageData);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent validation requests', async () => {
      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const requests = Array(10).fill().map((_, index) =>
        validateGestureWithOpenAI({
          image: {
            uri: 'data:image/jpeg;base64,test',
            base64: 'test',
            width: 640,
            height: 480,
            timestamp: Date.now(),
          },
          expectedGesture: `gesture_${index}`,
        })
      );

      const results = await Promise.all(requests);

      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.gesture).toBe(`gesture_${index}`);
        expect(result.confidence).toBe(0.85);
      });

      // Verify OpenAI was called 10 times
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(10);
    });

    it('should maintain response times within acceptable limits', async () => {
      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const startTime = Date.now();

      await validateGestureWithOpenAI({
        image: {
          uri: 'data:image/jpeg;base64,test',
          base64: 'test',
          width: 640,
          height: 480,
          timestamp: Date.now(),
        },
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should complete within reasonable time (allowing for network/mock delays)
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
    });
  });

  describe('Error Recovery', () => {
    it('should recover from temporary service outages', async () => {
      // First call fails
      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(new Error('Temporary outage'))
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                primary_gesture: {
                  gesture: 'hello',
                  confidence: 0.8,
                  feedback: 'Recovered validation',
                  quality_score: 8.0,
                  landmarks_detected: true,
                  hand_count: 1,
                },
                alternative_gestures: [],
                overall_confidence: 0.8,
              }),
            },
          }],
        });

      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      // First attempt should fail
      const firstResult = await validateGestureWithOpenAI({
        image: {
          uri: 'data:image/jpeg;base64,test',
          base64: 'test',
          width: 640,
          height: 480,
          timestamp: Date.now(),
        },
      });

      expect(firstResult.success).toBe(false);

      // Second attempt should succeed
      const secondResult = await validateGestureWithOpenAI({
        image: {
          uri: 'data:image/jpeg;base64,test',
          base64: 'test',
          width: 640,
          height: 480,
          timestamp: Date.now(),
        },
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.gesture).toBe('hello');
    });

    it('should handle malformed server responses', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: 'Invalid JSON response {{{',
          },
        }],
      });

      const { validateGestureWithOpenAI } = require('../../app/src/services/openaiGestureValidationService');

      const result = await validateGestureWithOpenAI({
        image: {
          uri: 'data:image/jpeg;base64,test',
          base64: 'test',
          width: 640,
          height: 480,
          timestamp: Date.now(),
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});