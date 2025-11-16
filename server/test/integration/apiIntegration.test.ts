import request from 'supertest';
import { app } from '../../src/server';

describe('Health Check Integration', () => {
  it('returns healthy status payloads', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.uptime).toBe('number');
    expect(response.body.pendingTrainingJobs).toBeGreaterThanOrEqual(0);
  });
});
