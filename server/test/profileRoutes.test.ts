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

describe('Profile registry routes', () => {
  let tmpDir: string;
  let app: express.Express;
  let db: Database;
  let dbPath: string;
  let registryPath: string;
  let manifestPath: string;
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
    manifestPath = path.join(tmpDir, 'datasets', 'training_manifest.json');
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

    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify({
      entries: [{ id: 'bundle-1', profileId: source.id, label: 'HALLO' }],
    }));
    await fs.writeFile(path.join(tmpDir, 'dgs_samples.json'), JSON.stringify({
      samples: [{ id: 'sample-1', profileId: source.id, label: 'HALLO', landmarks: [], ts: Date.now() }],
    }));
    await fs.mkdir(datasetsDir, { recursive: true });
    await fs.writeFile(path.join(datasetsDir, 'custom_signs.json'), JSON.stringify({
      signs: [{ id: 'custom-1', label: 'Hallo', profileId: source.id }],
    }));

    jest.resetModules();
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

    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as { entries: Array<{ profileId: string }> };
    expect(manifest.entries[0]?.profileId).toBe('22222222-2222-4222-8222-222222222222');

    const samplesRaw = await fs.readFile(path.join(tmpDir, 'dgs_samples.json'), 'utf8');
    const samples = JSON.parse(samplesRaw) as { samples: Array<{ profileId: string }> };
    expect(samples.samples[0]?.profileId).toBe('22222222-2222-4222-8222-222222222222');

    const customRaw = await fs.readFile(path.join(datasetsDir, 'custom_signs.json'), 'utf8');
    const custom = JSON.parse(customRaw) as { signs: Array<{ profileId: string }> };
    expect(custom.signs[0]?.profileId).toBe('22222222-2222-4222-8222-222222222222');

    expect(db.profiles.find((p) => p.id === '11111111-1111-4111-8111-111111111111')).toBeUndefined();
  });
});
