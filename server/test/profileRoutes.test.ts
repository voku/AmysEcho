import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import type { Database } from '../src/db.js';
import { createEmptyRegistry, ensureProfileRecord, saveProfileRegistry } from '../src/services/profileRegistry.js';
import { AuthService } from '../src/services/authService.js';

const accessToken = AuthService.generateTokens({
  id: 'profile-tester',
  username: 'profile-tester',
  role: 'caregiver',
}).accessToken;

function collectBinaryResponse(
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
  res.on('error', (error) => {
    callback(error as Error);
  });
}

describe('Profile registry routes', () => {
  let tmpDir: string;
  let app: express.Express;
  let db: Database;
  let dbPath: string;
  let registryPath: string;
  let datasetsDir: string;
  let registerProfileRoutes: typeof import('../src/routes/profileRoutes.js').registerProfileRoutes;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-profiles-'));
    process.env.AMY_ECHO_DATA_DIR = tmpDir;
  });

  beforeEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    dbPath = path.join(tmpDir, 'db.json');
    registryPath = path.join(tmpDir, 'profile_registry.json');
    datasetsDir = path.join(tmpDir, 'datasets');
    db = {
      users: [],
      symbols: [],
      signDefinitions: [],
      signTrainingData: [],
      interactionLogs: [],
      profiles: [],
      vocabularySets: [],
      vocabularySetSymbols: [],
      usageStats: [],
      learningAnalytics: [],
      corrections: [],
      negativeSamples: [],
    };
    const { loadDatabase } = await import('../src/db.js');
    await loadDatabase(dbPath);

    const registry = createEmptyRegistry();
    const source = ensureProfileRecord(registry, {
      id: '11111111-1111-4111-8111-111111111111',
      displayName: 'Quelle',
    });
    const target = ensureProfileRecord(registry, {
      id: '22222222-2222-4222-8222-222222222222',
      displayName: 'Ziel',
    });
    db.profiles.push({
      id: source.id,
      userId: 'profile-tester', // Set userId to match the test user
      displayName: source.displayName,
      createdAt: source.createdAt,
      consentDataUpload: false,
      consentHelpMeGetSmarter: false,
      vocabularySetId: 'basic',
    });
    db.profiles.push({
      id: target.id,
      userId: 'profile-tester', // Set userId to match the test user
      displayName: target.displayName,
      createdAt: target.createdAt,
      consentDataUpload: false,
      consentHelpMeGetSmarter: false,
      vocabularySetId: 'basic',
    });
    db.usageStats.push({ id: 'stat-1', symbolId: 'hallo', profileId: source.id, count: 2 });
    db.corrections.push({
      id: 'corr-1',
      predictedSign: 'hallo',
      actualSign: 'hilfe',
      confidence: 0.2,
      timestamp: Date.now(),
      isSynced: false,
      profileId: source.id,
    });
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    await saveProfileRegistry(registryPath, registry);

    const { saveTrainingManifest, saveDgsSamples, saveCustomSigns } = await import('../src/services/trainingJsonStore.js');
    saveTrainingManifest({
      entries: [{ id: 'bundle-1', profileId: source.id, label: 'HALLO' }],
    });
    saveDgsSamples({
      samples: [{ id: 'sample-1', profileId: source.id, label: 'HALLO', landmarks: [], ts: Date.now() }],
    });
    saveCustomSigns({
      signs: [{ id: 'custom-1', label: 'Hallo', profileId: source.id }],
    });

    const module = await import('../src/routes/profileRoutes.js');
    registerProfileRoutes = module.registerProfileRoutes;
    app = express();
    app.use(express.json());
    registerProfileRoutes(app, {
      authMiddleware: (req, res, next) => {
        if (req.get('Authorization') !== `Bearer ${accessToken}`) {
          res.status(401).json({ error: 'Nicht autorisiert.' });
          return;
        }
        // Set req.user to match the token
        req.user = { id: 'profile-tester', username: 'profile-tester', role: 'caregiver' };
        next();
      },
      db,
      dbFilePath: dbPath,
      registry,
      registryPath,
      withFileLock: async (_file, callback) => callback(),
      saveRegistry: saveProfileRegistry,
      logError: () => {},
    });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
  });

  it('merges profile data into target profile', async () => {
    await request(app)
      .post('/api/v1/profiles/22222222-2222-4222-8222-222222222222/merge')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sourceProfileId: '11111111-1111-4111-8111-111111111111' })
      .expect(200);

    const { loadTrainingManifest, loadDgsSamples, loadCustomSigns } = await import('../src/services/trainingJsonStore.js');
    const manifest = loadTrainingManifest() as { entries: Array<{ profileId: string }> };
    expect(manifest.entries[0]?.profileId).toBe('22222222-2222-4222-8222-222222222222');

    const samples = loadDgsSamples() as { samples: Array<{ profileId: string }> };
    expect(samples.samples[0]?.profileId).toBe('22222222-2222-4222-8222-222222222222');

    const custom = loadCustomSigns() as { signs: Array<{ profileId: string }> };
    expect(custom.signs[0]?.profileId).toBe('22222222-2222-4222-8222-222222222222');

    expect(db.profiles.find((p) => p.id === '11111111-1111-4111-8111-111111111111')).toBeUndefined();
  });

  it('exports and restores a full profile archive', async () => {
    const sourceId = '11111111-1111-4111-8111-111111111111';
    const { MLP_MODELS_DIR, TRAINING_UPLOADS_DIR } = await import('../src/constants/modelPaths.js');
    const uploadFile = path.join(TRAINING_UPLOADS_DIR, sourceId, 'HALLO', 'bundle-1_landmarks.json');
    const modelFile = path.join(MLP_MODELS_DIR, sourceId, 'amy_model.npz');

    await fs.mkdir(path.dirname(uploadFile), { recursive: true });
    await fs.writeFile(uploadFile, JSON.stringify({ frames: [{ landmarks: [[0.1, 0.2, 0.3]] }] }));
    await fs.mkdir(path.dirname(modelFile), { recursive: true });
    await fs.writeFile(modelFile, Buffer.from('profile-model'));

    const exportResponse = await request(app)
      .get(`/api/v1/profiles/${sourceId}/backup/export`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(collectBinaryResponse)
      .expect(200);
    const archiveBuffer = exportResponse.body as Buffer;

    expect(exportResponse.headers['content-type']).toContain('application/zip');
    expect(archiveBuffer.length).toBeGreaterThan(0);

    db.usageStats = [];
    db.corrections = [];
    const { saveTrainingManifest, saveDgsSamples, saveCustomSigns, loadTrainingManifest, loadDgsSamples, loadCustomSigns } = await import('../src/services/trainingJsonStore.js');
    saveTrainingManifest({ entries: [] });
    saveDgsSamples({ samples: [] });
    saveCustomSigns({ signs: [] });
    await fs.rm(path.join(TRAINING_UPLOADS_DIR, sourceId), { recursive: true, force: true });
    await fs.rm(path.join(MLP_MODELS_DIR, sourceId), { recursive: true, force: true });

    await request(app)
      .post(`/api/v1/profiles/${sourceId}/sync`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ archiveBase64: archiveBuffer.toString('base64') })
      .expect(200);

    const restoredManifest = loadTrainingManifest() as {
      entries: Array<{ profileId: string; label: string }>;
    };
    expect(restoredManifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profileId: sourceId, label: 'HALLO' }),
      ]),
    );

    const restoredSamples = loadDgsSamples() as {
      samples: Array<{ profileId: string; label: string }>;
    };
    expect(restoredSamples.samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profileId: sourceId, label: 'HALLO' }),
      ]),
    );

    const restoredCustomSigns = loadCustomSigns() as {
      signs: Array<{ profileId: string; label: string }>;
    };
    expect(restoredCustomSigns.signs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profileId: sourceId, label: 'Hallo' }),
      ]),
    );

    expect(db.profiles.find((profile) => profile.id === sourceId)).toBeDefined();
    expect(db.usageStats.some((stat) => stat.profileId === sourceId)).toBe(true);
    expect(db.corrections.some((correction) => correction.profileId === sourceId)).toBe(true);

    await expect(fs.readFile(uploadFile, 'utf8')).resolves.toContain('landmarks');
    await expect(fs.readFile(modelFile)).resolves.toEqual(Buffer.from('profile-model'));
  });
});
