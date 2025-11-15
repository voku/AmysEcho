/**
 * Tests for OpenAI Vision Service
 */

import {
  validateGestureWithVision,
  isVisionServiceAvailable,
  getVisionServiceHealth,
  __clearGestureMeaningCacheForTests,
} from '../src/services/openaiVisionService';

const originalFetch = global.fetch;
const mockFetch = jest.fn();

function buildRefinementPayload(meaning: string, sources: string[] = []) {
  return {
    output_text: JSON.stringify({
      contextual_meaning: meaning,
      reference_sources: sources,
    }),
  } as any;
}

beforeAll(() => {
  (global as any).fetch = mockFetch;
});

afterAll(() => {
  (global as any).fetch = originalFetch;
});

// Mock OpenAI
jest.mock('openai', () => {
  const responses = { create: jest.fn() };
  const ctor = jest.fn().mockImplementation(() => ({ responses }));
  (ctor as any).__responses = responses;
  return ctor;
});

describe('OpenAI Vision Service', () => {
  let responses: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    delete process.env.OPENAI_API_KEY;

    const OpenAIMock = require('openai');
    responses = (OpenAIMock as any).__responses;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        AbstractText: 'DGS: Die Hand bewegt sich zum Gruß nach außen – bedeutet Hallo.',
        AbstractURL: 'https://lexikon.beispiel/hallo',
      }),
    });
  });

  afterEach(() => {
    __clearGestureMeaningCacheForTests();
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

      responses.create.mockResolvedValueOnce(mockResponse);
      responses.create.mockResolvedValueOnce(
        buildRefinementPayload('Bewegung zum Gruß – das bedeutet im DGS-Kontext „Hallo“. ', [
          'https://lexikon.beispiel/hallo',
        ])
      );

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
        expectedGesture: 'hello',
      });

      expect(result.primary_gesture.gesture).toBe('hello');
      expect(result.primary_gesture.confidence).toBe(0.85);
      expect(result.primary_gesture.feedback).toBe('Clear gesture execution');
      expect(result.primary_gesture.quality_score).toBe(8.5);
      expect(result.primary_gesture.suggestions).toEqual(['Keep hand steady']);
      expect(result.primary_gesture.contextual_meaning).toContain('Hallo');
      expect(result.primary_gesture.reference_sources).toContain('https://lexikon.beispiel/hallo');
      expect(result.overall_confidence).toBe(0.85);
      expect(result.processing_time_ms).toBeGreaterThan(0);
      expect(result.service_status.available).toBe(true);
      expect(result.service_status.model).toBe('gpt-5.1');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('falls back to secondary vision model when primary is unavailable', async () => {
      const firstError = new Error('The model `gpt-5.1` does not exist');
      responses.create.mockRejectedValueOnce(firstError);

      const backupResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'hilfe',
            confidence: 0.62,
            feedback: 'Hand zur Brust – klarer Hilferuf',
            quality_score: 6.5,
            suggestions: ['Handfläche ruhig halten'],
            landmarks_detected: true,
            hand_count: 1,
          },
          overall_confidence: 0.62,
        }),
      } as any;
      responses.create.mockResolvedValueOnce(backupResponse);
      responses.create.mockResolvedValueOnce(
        buildRefinementPayload('Hand zur Brust gelegt – in DGS signalisiert das „HILFE“.', [
          'https://lexikon.beispiel/hilfe',
        ])
      );

      const result = await validateGestureWithVision({ imageBase64: 'test-image-data' });

      expect(responses.create).toHaveBeenCalledTimes(3);
      expect(responses.create.mock.calls[0][0].model).toBe('gpt-5.1');
      expect(responses.create.mock.calls[1][0].model).toBe('gpt-4.1');
      expect(responses.create.mock.calls[2][0].model).toBe('gpt-4.1');
      expect(result.service_status.model).toBe('gpt-4.1');
      expect(result.primary_gesture.gesture).toBe('hilfe');
      expect(result.primary_gesture.contextual_meaning).toContain('HILFE');
    });

    it('should handle API errors gracefully', async () => {
      responses.create.mockRejectedValue(new Error('API Error'));

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
      });

      expect(result.primary_gesture.gesture).toBe('unknown');
      expect(result.primary_gesture.confidence).toBe(0);
      expect(result.primary_gesture.feedback).toBe('Unable to analyze gesture image');
      expect(result.primary_gesture.quality_score).toBe(0);
      expect(result.primary_gesture.contextual_meaning).toBe(
        'Keine zusätzlichen Informationen gefunden. Bitte im DGS-Lexikon oder online nachsehen.',
      );
      expect(result.overall_confidence).toBe(0);
      expect(result.processing_time_ms).toBeGreaterThan(0);
      expect(result.service_status.available).toBe(false);
      expect(result.service_status.reason).toBe('request_failed');
    });

    it('should handle malformed API responses', async () => {
      const mockResponse = { output_text: 'Invalid JSON response' } as any;
      responses.create.mockResolvedValueOnce(mockResponse);
      responses.create.mockResolvedValueOnce(mockResponse);

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
      });

      expect(result.primary_gesture.gesture).toBe('unknown');
      expect(result.primary_gesture.confidence).toBe(0);
      expect(result.service_status.available).toBe(false);
      expect(result.primary_gesture.contextual_meaning).toBe('Keine zusätzlichen Informationen gefunden. Bitte im DGS-Lexikon oder online nachsehen.');
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
      responses.create.mockResolvedValueOnce(mockResponse);
      responses.create.mockResolvedValueOnce(
        buildRefinementPayload('Gute Ausführung – das Zeichen wird als „HELLO“ erkannt.', [])
      );

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
      });

      expect(result.primary_gesture.confidence).toBe(1.0); // Clamped to max
      expect(result.primary_gesture.quality_score).toBe(10); // Clamped to max
      expect(result.primary_gesture.hand_count).toBe(2); // Clamped to max
      expect(result.service_status.available).toBe(true);
      expect(result.primary_gesture.contextual_meaning).toContain('HELLO');
    });

    it('should enrich contextual meaning from external lookup when available', async () => {
      const mockResponse = {
        output_text: JSON.stringify({
          primary_gesture: {
            gesture: 'urinieren',
            confidence: 0.78,
            feedback: 'Hand zeigt nach unten',
            quality_score: 7.2,
            landmarks_detected: true,
            hand_count: 1,
          },
          overall_confidence: 0.78,
        }),
      } as any;

      responses.create.mockResolvedValueOnce(mockResponse);
      responses.create.mockResolvedValueOnce(
        buildRefinementPayload('Zeigefinger zeigt nach unten – in DGS bedeutet das „Urinieren“. ', [
          'https://lexikon.beispiel/urinieren',
          'https://refine.example/urinieren',
        ])
      );
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          AbstractText: 'DGS: Finger zeigt nach unten – bedeutet Urinieren.',
          AbstractURL: 'https://lexikon.beispiel/urinieren',
        }),
      });

      const result = await validateGestureWithVision({
        imageBase64: 'test-image-data',
        expectedGesture: 'urinieren',
      });

      expect(result.primary_gesture.gesture).toBe('urinieren');
      expect(result.primary_gesture.contextual_meaning).toMatch(/Urinieren/);
      expect(result.primary_gesture.reference_sources).toEqual(
        expect.arrayContaining([
          'https://lexikon.beispiel/urinieren',
          'https://refine.example/urinieren',
        ])
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should include context information in prompt', async () => {
      const mockResponse = { output_text: JSON.stringify({
        primary_gesture: {
          gesture: 'hello', confidence: 0.8, feedback: 'Good morning greeting', quality_score: 8.0,
          landmarks_detected: true, hand_count: 1,
        }, alternative_gestures: [], overall_confidence: 0.8,
      }) } as any;

      responses.create.mockResolvedValue(mockResponse);

      await validateGestureWithVision({
        imageBase64: 'test-image-data',
        expectedGesture: 'hello',
        context: { environment: 'home', session_id: 'test-session' },
      });

      const callArgs = responses.create.mock.calls[0][0];
      const content = callArgs.input[0].content;
      const textItem = content.find((c: any) => c.type === 'input_text');
      expect(textItem.text).toContain('Environment: home');
    });

    it('should handle empty API response', async () => {
      const mockResponse = { output_text: '' } as any;
      responses.create.mockResolvedValue(mockResponse);

      const result = await validateGestureWithVision({ imageBase64: 'test-image-data' });
      expect(result.primary_gesture.gesture).toBe('unknown');
      expect(result.primary_gesture.confidence).toBe(0);
      expect(result.service_status.available).toBe(false);
    });
  });
});
