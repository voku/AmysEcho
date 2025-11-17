import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import express, { type Express } from 'express';
import request from 'supertest';

describe('custom gestures route', () => {
  let app: Express;
  let dataDir: string;
  let gesturesPath: string;

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-gestures-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    process.env.API_TOKEN = 'secret-token';
    app = express();
    app.use(express.json());
    const mod = await import('../src/routes/customGesturesRoute.js');
    const registerCustomGesturesRoute = mod.registerCustomGesturesRoute;
    registerCustomGesturesRoute(app);
    gesturesPath = path.join(dataDir, 'datasets', 'custom_gestures.json');
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
    delete process.env.API_TOKEN;
  });

  beforeEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(dataDir, { recursive: true });
  });

  it('stores a new custom gesture and persists metadata', async () => {
    const response = await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'hilfe', label: 'Hilfe zeigen', emoji: '🖐️' })
      .expect(201);

    expect(response.body).toMatchObject({ id: 'hilfe', label: 'Hilfe zeigen', emoji: '🖐️' });
    expect(typeof response.body.createdAt).toBe('string');

    const raw = await fs.readFile(gesturesPath, 'utf8');
    const stored = JSON.parse(raw);
    expect(stored.gestures).toHaveLength(1);
    expect(stored.gestures[0]).toMatchObject({ id: 'hilfe', label: 'Hilfe zeigen', emoji: '🖐️' });
  });

  it('updates an existing gesture instead of duplicating entries', async () => {
    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'hilfe', label: 'Hilfe zeigen', emoji: '🖐️' })
      .expect(201);

    const response = await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'hilfe', label: 'Hilfe jetzt', emoji: null })
      .expect(200);

    expect(response.body).toMatchObject({ id: 'hilfe', label: 'Hilfe jetzt', emoji: null });

    const raw = await fs.readFile(gesturesPath, 'utf8');
    const stored = JSON.parse(raw);
    expect(stored.gestures).toHaveLength(1);
    expect(stored.gestures[0]).toMatchObject({ id: 'hilfe', label: 'Hilfe jetzt', emoji: null });
  });

  it('lists stored gestures via GET', async () => {
    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'hilfe', label: 'Hilfe zeigen' })
      .expect(201);

    const response = await request(app)
      .get('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .expect(200);

    expect(Array.isArray(response.body.gestures)).toBe(true);
    expect(response.body.gestures).toHaveLength(1);
    expect(response.body.gestures[0]).toMatchObject({ id: 'hilfe', label: 'Hilfe zeigen' });
  });
});
