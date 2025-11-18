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

  it('lists stored gestures via GET with profileId filter', async () => {
    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'hilfe', label: 'Hilfe zeigen', profileId: 'profile-test' })
      .expect(201);

    const response = await request(app)
      .get('/api/v1/dgs/gestures?profileId=profile-test')
      .set('Authorization', 'Bearer secret-token')
      .expect(200);

    expect(Array.isArray(response.body.gestures)).toBe(true);
    expect(response.body.gestures).toHaveLength(1);
    expect(response.body.gestures[0]).toMatchObject({ id: 'hilfe', label: 'Hilfe zeigen', profileId: 'profile-test' });
  });

  it('accepts ASCII-slugified German gesture IDs', async () => {
    // Test German umlauts converted to ASCII
    const response1 = await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'aerger_zeigen', label: 'Ärger zeigen', emoji: '😠' })
      .expect(201);

    expect(response1.body).toMatchObject({ id: 'aerger_zeigen', label: 'Ärger zeigen', emoji: '😠' });

    // Test ß converted to ss
    const response2 = await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'fuss_wackeln', label: 'Fuß wackeln', emoji: '🦶' })
      .expect(201);

    expect(response2.body).toMatchObject({ id: 'fuss_wackeln', label: 'Fuß wackeln', emoji: '🦶' });

    // Verify both are stored
    const raw = await fs.readFile(gesturesPath, 'utf8');
    const stored = JSON.parse(raw);
    expect(stored.gestures).toHaveLength(2);
  });

  it('rejects non-ASCII gesture IDs with Unicode characters', async () => {
    // This should fail because the ID contains ä (not slugified)
    const response = await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'ärger_zeigen', label: 'Ärger zeigen', emoji: '😠' })
      .expect(400);

    expect(response.body.error).toBe('invalid gesture payload');
  });

  it('stores gestures with profileId for per-kid isolation', async () => {
    // Add gesture for profile A
    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'mein_zeichen', label: 'Mein Zeichen', profileId: 'profile-a', emoji: '👋' })
      .expect(201);

    // Add gesture for profile B
    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'dein_zeichen', label: 'Dein Zeichen', profileId: 'profile-b', emoji: '🤚' })
      .expect(201);

    // Verify both are stored
    const raw = await fs.readFile(gesturesPath, 'utf8');
    const stored = JSON.parse(raw);
    expect(stored.gestures).toHaveLength(2);
    expect(stored.gestures[0]).toMatchObject({ id: 'mein_zeichen', profileId: 'profile-a' });
    expect(stored.gestures[1]).toMatchObject({ id: 'dein_zeichen', profileId: 'profile-b' });
  });

  it('filters gestures by profileId when listing', async () => {
    // Add gestures for different profiles
    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'gesture_a', label: 'Gesture A', profileId: 'profile-a' })
      .expect(201);

    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'gesture_b', label: 'Gesture B', profileId: 'profile-b' })
      .expect(201);

    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'gesture_shared', label: 'Shared Gesture' })
      .expect(201);

    // Get all gestures without profileId - should return empty array for data isolation
    const allResponse = await request(app)
      .get('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .expect(200);

    expect(allResponse.body.gestures).toHaveLength(0);

    // Get gestures for profile A
    const profileAResponse = await request(app)
      .get('/api/v1/dgs/gestures?profileId=profile-a')
      .set('Authorization', 'Bearer secret-token')
      .expect(200);

    expect(profileAResponse.body.gestures).toHaveLength(1);
    expect(profileAResponse.body.gestures[0]).toMatchObject({ id: 'gesture_a', profileId: 'profile-a' });

    // Get gestures for profile B
    const profileBResponse = await request(app)
      .get('/api/v1/dgs/gestures?profileId=profile-b')
      .set('Authorization', 'Bearer secret-token')
      .expect(200);

    expect(profileBResponse.body.gestures).toHaveLength(1);
    expect(profileBResponse.body.gestures[0]).toMatchObject({ id: 'gesture_b', profileId: 'profile-b' });
  });

  it('allows same gesture ID for different profiles', async () => {
    // Profile A creates "help" gesture
    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'help', label: 'Help from A', profileId: 'profile-a' })
      .expect(201);

    // Profile B creates "help" gesture (same ID, different profile)
    await request(app)
      .post('/api/v1/dgs/gestures')
      .set('Authorization', 'Bearer secret-token')
      .send({ id: 'help', label: 'Help from B', profileId: 'profile-b' })
      .expect(201);

    // Both should be stored
    const raw = await fs.readFile(gesturesPath, 'utf8');
    const stored = JSON.parse(raw);
    expect(stored.gestures).toHaveLength(2);
    expect(stored.gestures[0]).toMatchObject({ id: 'help', label: 'Help from A', profileId: 'profile-a' });
    expect(stored.gestures[1]).toMatchObject({ id: 'help', label: 'Help from B', profileId: 'profile-b' });
  });
});
