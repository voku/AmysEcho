/**
 * Integration test for the dialog endpoint using OpenAI Responses API
 * Mirrors the pattern used in openai-validation-e2e.test.js
 */

import request from 'supertest';
import express from 'express';

// Mock OpenAI SDK
jest.mock('openai', () => {
  const responses = { create: jest.fn() };
  return jest.fn().mockImplementation(() => ({ responses }));
});

describe('Dialog Endpoint (Integration)', () => {
  let serverApp;
  let mockOpenAI;

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const { default: OpenAIMock } = await import('openai');
    mockOpenAI = new OpenAIMock();

    // Build a small app that uses the server dialog service
    serverApp = express();
    serverApp.use(express.json());

    // Simple auth middleware compatible with server legacy behavior
    const token = 'test-token';
    serverApp.use('/dialog', (req, res, next) => {
      const auth = req.headers.authorization || '';
      if (!auth.includes(token)) return res.status(401).json({ error: 'Unauthorized' });
      next();
    });

    // Mount the route using the actual server dialog service
    serverApp.post('/dialog', async (req, res) => {
      try {
        const { getLLMSuggestions } = await import('../../server/src/services/dialogEngine.ts');
        const body = req.body || {};

        const out = await getLLMSuggestions({
          input: body.input,
          context: Array.isArray(body.context) ? body.context : [],
          language: body.language || 'de',
          age: Number(body.age || 5),
        });
        res.json(out);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Dialog route error:', err);
        res.status(500).json({ nextWords: [], caregiverPhrases: [] });
      }
    });
  });

  it('returns JSON suggestions from Responses API', async () => {
    mockOpenAI.responses.create.mockResolvedValue({
      output_text: JSON.stringify({ nextWords: ['ja'], caregiverPhrases: ['gut so'] }),
    });

    const body = { input: 'Hallo', context: [], language: 'de', age: 5 };
    const resp = await request(serverApp)
      .post('/dialog')
      .set('Authorization', 'Bearer test-token')
      .send(body)
      .expect(200);

    expect(resp.body.nextWords).toContain('ja');
    expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(1);
  });

  it('caches identical requests within TTL', async () => {
    mockOpenAI.responses.create.mockResolvedValue({
      output_text: JSON.stringify({ nextWords: ['bitte'], caregiverPhrases: ['prima'] }),
    });

    const body = { input: 'Hallo', context: [], language: 'de', age: 5 };
    await request(serverApp)
      .post('/dialog')
      .set('Authorization', 'Bearer test-token')
      .send(body)
      .expect(200);

    await request(serverApp)
      .post('/dialog')
      .set('Authorization', 'Bearer test-token')
      .send(body)
      .expect(200);

    // Service-level cache should reduce calls to 1
    expect(mockOpenAI.responses.create).toHaveBeenCalledTimes(1);
  });
});

