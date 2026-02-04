import request from 'supertest';
import { app, databaseReady } from '../../src/server.js';

describe('Health Check Integration', () => {
  beforeAll(async () => {
    await databaseReady;
  });

  it('returns healthy status payloads', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    // Status can be 'ok' or 'degraded' depending on system state
    expect(['ok', 'degraded']).toContain(response.body.status);
    expect(typeof response.body.uptime).toBe('number');
    expect(response.body.pendingTrainingJobs).toBeGreaterThanOrEqual(0);
    // Verify checks object exists
    expect(response.body).toHaveProperty('checks');
    expect(response.body).toHaveProperty('timestamp');
  });
});
