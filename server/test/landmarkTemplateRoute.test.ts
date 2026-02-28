import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import express, { type Express } from 'express';
import request from 'supertest';
import { AuthService } from '../src/services/authService.js';

describe('landmark template route', () => {
  let app: Express;
  let dataDir: string;
  let accessToken: string;
  const profileId = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-templates-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    jest.resetModules();
    accessToken = AuthService.generateTokens({
      id: 'tester',
      username: 'tester',
      role: 'caregiver',
    }).accessToken;
    app = express();
    app.use(express.json());
    const mod = await import('../src/routes/landmarkTemplateRoute.js');
    mod.registerLandmarkTemplateRoute(app);
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
  });

  beforeEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(dataDir, { recursive: true });
  });

  function makeLandmarks(count: number): [number, number, number][] {
    return Array.from({ length: count }, (_, i) => [
      i * 0.01,
      i * 0.02,
      i * 0.001,
    ] as [number, number, number]);
  }

  it('stores a new landmark template', async () => {
    const response = await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        label: 'Hilfe',
        profileId,
        landmarks: makeLandmarks(21),
        handedness: 'right',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      label: 'hilfe',
      profileId,
      handedness: 'right',
    });
    expect(typeof response.body.id).toBe('string');
    expect(typeof response.body.createdAt).toBe('string');
    expect(response.body.landmarks).toHaveLength(21);
  });

  it('stores a two-hand template with 42 landmarks', async () => {
    const response = await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        label: 'Beide Hände',
        profileId,
        landmarks: makeLandmarks(42),
        handedness: 'both',
      })
      .expect(201);

    expect(response.body.landmarks).toHaveLength(42);
    expect(response.body.handedness).toBe('both');
  });

  it('rejects landmarks with invalid count', async () => {
    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        label: 'Bad',
        profileId,
        landmarks: makeLandmarks(10),
        handedness: 'right',
      })
      .expect(400);
  });

  it('rejects invalid profileId format', async () => {
    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        label: 'Bad',
        profileId: 'not-a-uuid',
        landmarks: makeLandmarks(21),
      })
      .expect(400);
  });

  it('lists templates for a profile', async () => {
    // Store two templates
    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Hilfe', profileId, landmarks: makeLandmarks(21), handedness: 'right' })
      .expect(201);

    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Danke', profileId, landmarks: makeLandmarks(21), handedness: 'left' })
      .expect(201);

    const response = await request(app)
      .get(`/api/v1/landmarks/templates?profileId=${profileId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.templates).toHaveLength(2);
    expect(response.body.templates[0]).toMatchObject({ label: 'hilfe' });
    expect(response.body.templates[1]).toMatchObject({ label: 'danke' });
  });

  it('returns empty array when no profileId given', async () => {
    const response = await request(app)
      .get('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.templates).toEqual([]);
  });

  it('isolates templates by profile', async () => {
    const profileA = '22222222-2222-4222-8222-222222222222';
    const profileB = '33333333-3333-4333-8333-333333333333';

    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'A', profileId: profileA, landmarks: makeLandmarks(21) })
      .expect(201);

    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'B', profileId: profileB, landmarks: makeLandmarks(21) })
      .expect(201);

    const responseA = await request(app)
      .get(`/api/v1/landmarks/templates?profileId=${profileA}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(responseA.body.templates).toHaveLength(1);
    expect(responseA.body.templates[0].label).toBe('a');

    const responseB = await request(app)
      .get(`/api/v1/landmarks/templates?profileId=${profileB}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(responseB.body.templates).toHaveLength(1);
    expect(responseB.body.templates[0].label).toBe('b');
  });

  it('deletes a template by id', async () => {
    const createRes = await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Remove Me', profileId, landmarks: makeLandmarks(21), handedness: 'right' })
      .expect(201);

    const templateId = createRes.body.id;

    await request(app)
      .delete(`/api/v1/landmarks/templates/${templateId}?profileId=${profileId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const listRes = await request(app)
      .get(`/api/v1/landmarks/templates?profileId=${profileId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listRes.body.templates).toHaveLength(0);
  });

  it('returns 404 when deleting non-existent template', async () => {
    await request(app)
      .delete(`/api/v1/landmarks/templates/non_existent?profileId=${profileId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('deletes all templates for a label', async () => {
    // Add multiple templates for the same label
    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'ToDelete', profileId, landmarks: makeLandmarks(21) })
      .expect(201);

    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'ToDelete', profileId, landmarks: makeLandmarks(21) })
      .expect(201);

    await request(app)
      .post('/api/v1/landmarks/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Keep', profileId, landmarks: makeLandmarks(21) })
      .expect(201);

    const delRes = await request(app)
      .delete(`/api/v1/landmarks/templates?profileId=${profileId}&label=ToDelete`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(delRes.body.deleted).toBe(2);

    const listRes = await request(app)
      .get(`/api/v1/landmarks/templates?profileId=${profileId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listRes.body.templates).toHaveLength(1);
    expect(listRes.body.templates[0].label).toBe('keep');
  });

  it('requires auth for all endpoints', async () => {
    await request(app).get('/api/v1/landmarks/templates').expect(401);
    await request(app).post('/api/v1/landmarks/templates').send({}).expect(401);
    await request(app).delete('/api/v1/landmarks/templates/foo').expect(401);
  });
});
