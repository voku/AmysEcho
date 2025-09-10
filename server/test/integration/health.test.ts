import request from 'supertest';
import express from 'express';

describe('health endpoint', () => {
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  test('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
