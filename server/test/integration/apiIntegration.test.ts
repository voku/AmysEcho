import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

describe('Health Check Integration', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json({ limit: '8mb' }));
    app.use(express.urlencoded({ extended: true, limit: '8mb' }));
    app.use('/health', rateLimit({ windowMs: 1000, max: 100 }));
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', uptime: process.uptime() });
    });
  });

  it('returns healthy status payloads', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.uptime).toBe('number');
  });
});
