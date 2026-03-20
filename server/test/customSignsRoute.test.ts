import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import express, { type Express } from 'express';
import request from 'supertest';
import { AuthService } from '../src/services/authService.js';

describe('custom signs route', () => {
  let app: Express;
  let dataDir: string;
  let dbPath: string;
  let accessToken: string;
  let loadCustomSignsFromStore: typeof import('../src/services/trainingJsonStore.js').loadCustomSigns;

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-signs-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    jest.resetModules();
    accessToken = AuthService.generateTokens({
      id: 'tester',
      username: 'tester',
      role: 'caregiver',
    }).accessToken;
    app = express();
    app.use(express.json());
    const mod = await import('../src/routes/customSignsRoute.js');
    const registerCustomSignsRoute = mod.registerCustomSignsRoute;
    const { loadDatabase } = await import('../src/db.js');
    ({ loadCustomSigns: loadCustomSignsFromStore } = await import('../src/services/trainingJsonStore.js'));
    dbPath = path.join(dataDir, 'db.json');
    await loadDatabase(dbPath);
    registerCustomSignsRoute(app);
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
  });

  beforeEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(dataDir, { recursive: true });
    const { loadDatabase } = await import('../src/db.js');
    dbPath = path.join(dataDir, `db-${Date.now()}.json`);
    await loadDatabase(dbPath);
  });

  it('stores a new custom sign and persists metadata', async () => {
    const response = await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'hilfe', label: 'Hilfe zeigen', emoji: '🖐️' })
      .expect(201);

    expect(response.body).toMatchObject({ id: 'hilfe', label: 'Hilfe zeigen', emoji: '🖐️' });
    expect(typeof response.body.createdAt).toBe('string');

    const stored = loadCustomSignsFromStore();
    expect(stored.signs).toHaveLength(1);
    expect(stored.signs[0]).toMatchObject({ id: 'hilfe', label: 'Hilfe zeigen', emoji: '🖐️' });
  });

  it('updates an existing sign instead of duplicating entries', async () => {
    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'hilfe', label: 'Hilfe zeigen', emoji: '🖐️' })
      .expect(201);

    const response = await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'hilfe', label: 'Hilfe jetzt', emoji: null })
      .expect(200);

    expect(response.body).toMatchObject({ id: 'hilfe', label: 'Hilfe jetzt', emoji: null });

    const stored = loadCustomSignsFromStore();
    expect(stored.signs).toHaveLength(1);
    expect(stored.signs[0]).toMatchObject({ id: 'hilfe', label: 'Hilfe jetzt', emoji: null });
  });

  it('lists stored signs via GET with profileId filter', async () => {
    const profileId = '11111111-1111-4111-8111-111111111111';
    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'hilfe', label: 'Hilfe zeigen', profileId })
      .expect(201);

    const response = await request(app)
      .get(`/api/v1/dgs/signs?profileId=${profileId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body.signs)).toBe(true);
    expect(response.body.signs).toHaveLength(1);
    expect(response.body.signs[0]).toMatchObject({ id: 'hilfe', label: 'Hilfe zeigen', profileId });
  });

  it('accepts ASCII-slugified German sign IDs', async () => {
    // Test German umlauts converted to ASCII
    const response1 = await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'aerger_zeigen', label: 'Ärger zeigen', emoji: '😠' })
      .expect(201);

    expect(response1.body).toMatchObject({ id: 'aerger_zeigen', label: 'Ärger zeigen', emoji: '😠' });

    // Test ß converted to ss
    const response2 = await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'fuss_wackeln', label: 'Fuß wackeln', emoji: '🦶' })
      .expect(201);

    expect(response2.body).toMatchObject({ id: 'fuss_wackeln', label: 'Fuß wackeln', emoji: '🦶' });

    // Verify both are stored
    const stored = loadCustomSignsFromStore();
    expect(stored.signs).toHaveLength(2);
  });

  it('rejects non-ASCII sign IDs with Unicode characters', async () => {
    // This should fail because the ID contains ä (not slugified)
    const response = await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'ärger_zeigen', label: 'Ärger zeigen', emoji: '😠' })
      .expect(400);

    expect(response.body.error).toBe('Ungültige Gebärden-Daten.');
  });

  it('stores signs with profileId for per-kid isolation', async () => {
    // Add sign for profile A
    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'mein_zeichen', label: 'Mein Zeichen', profileId: '22222222-2222-4222-8222-222222222222', emoji: '👋' })
      .expect(201);

    // Add sign for profile B
    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'dein_zeichen', label: 'Dein Zeichen', profileId: '33333333-3333-4333-8333-333333333333', emoji: '🤚' })
      .expect(201);

    // Verify both are stored
    const stored = loadCustomSignsFromStore();
    expect(stored.signs).toHaveLength(2);
    expect(stored.signs[0]).toMatchObject({ id: 'mein_zeichen', profileId: '22222222-2222-4222-8222-222222222222' });
    expect(stored.signs[1]).toMatchObject({ id: 'dein_zeichen', profileId: '33333333-3333-4333-8333-333333333333' });
  });

  it('filters signs by profileId when listing', async () => {
    // Add signs for different profiles
    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'sign_a', label: 'Sign A', profileId: '22222222-2222-4222-8222-222222222222' })
      .expect(201);

    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'sign_b', label: 'Sign B', profileId: '33333333-3333-4333-8333-333333333333' })
      .expect(201);

    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'sign_shared', label: 'Shared Sign' })
      .expect(201);

    // Get all signs without profileId - should return empty array for data isolation
    const allResponse = await request(app)
      .get('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(allResponse.body.signs).toHaveLength(0);

    // Get signs for profile A
    const profileAResponse = await request(app)
      .get('/api/v1/dgs/signs?profileId=22222222-2222-4222-8222-222222222222')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profileAResponse.body.signs).toHaveLength(1);
    expect(profileAResponse.body.signs[0]).toMatchObject({ id: 'sign_a', profileId: '22222222-2222-4222-8222-222222222222' });

    // Get signs for profile B
    const profileBResponse = await request(app)
      .get('/api/v1/dgs/signs?profileId=33333333-3333-4333-8333-333333333333')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profileBResponse.body.signs).toHaveLength(1);
    expect(profileBResponse.body.signs[0]).toMatchObject({ id: 'sign_b', profileId: '33333333-3333-4333-8333-333333333333' });
  });

  it('allows same sign ID for different profiles', async () => {
    // Profile A creates "help" sign
    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'help', label: 'Help from A', profileId: '22222222-2222-4222-8222-222222222222' })
      .expect(201);

    // Profile B creates "help" sign (same ID, different profile)
    await request(app)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'help', label: 'Help from B', profileId: '33333333-3333-4333-8333-333333333333' })
      .expect(201);

    // Both should be stored
    const stored = loadCustomSignsFromStore();
    expect(stored.signs).toHaveLength(2);
    expect(stored.signs[0]).toMatchObject({ id: 'help', label: 'Help from A', profileId: '22222222-2222-4222-8222-222222222222' });
    expect(stored.signs[1]).toMatchObject({ id: 'help', label: 'Help from B', profileId: '33333333-3333-4333-8333-333333333333' });
  });

  it('returns success even if training trigger throws after sign persistence', async () => {
    const triggerErrorApp = express();
    triggerErrorApp.use(express.json());
    const mod = await import('../src/routes/customSignsRoute.js');
    mod.registerCustomSignsRoute(triggerErrorApp, {
      triggerTrainingJob: () => {
        throw new Error('queue unavailable');
      },
    });

    const response = await request(triggerErrorApp)
      .post('/api/v1/dgs/signs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ id: 'fallback_sign', label: 'Fallback Sign' })
      .expect(201);

    expect(response.body).toMatchObject({ id: 'fallback_sign', label: 'Fallback Sign' });

    const stored = loadCustomSignsFromStore();
    expect(stored.signs.some((sign) => sign.id === 'fallback_sign')).toBe(true);
  });
});
