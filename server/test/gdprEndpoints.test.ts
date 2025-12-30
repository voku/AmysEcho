import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import type { Response } from 'supertest';

import type { Database } from '../src/db.js';
import { registerGdprRoutes } from '../src/routes/gdprRoutes.js';
import { createEmptyRegistry, ensureProfileRecord, saveProfileRegistry } from '../src/services/profileRegistry.js';
import AdmZip from 'adm-zip';

const LEGACY_TOKEN = 'gdpr-token';

const binaryParser = (res: Response, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Uint8Array[] = [];
  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
};

const profileId = '11111111-1111-4111-8111-111111111111';
const baseDb: Database = {
  users: [],
  symbols: [],
  signDefinitions: [],
  signTrainingData: [],
  interactionLogs: [],
  profiles: [
    {
      id: profileId,
      displayName: 'GDPR Test',
      createdAt: '2024-05-01T10:00:00.000Z',
      consentDataUpload: false,
      consentHelpMeGetSmarter: false,
      vocabularySetId: 'basic',
    },
  ],
  vocabularySets: [
    { id: 'basic', name: 'Basic' },
  ],
  vocabularySetSymbols: [],
  usageStats: [
    { id: 'stat-1', symbolId: 'hello', profileId, count: 3 },
  ],
  learningAnalytics: [],
  corrections: [
    {
      id: 'corr-1',
      predictedSign: 'hello',
      actualSign: 'hallo',
      confidence: 0.42,
      timestamp: 1728920000000,
      isSynced: false,
      profileId,
    },
  ],
  negativeSamples: [],
};

describe('GDPR profile endpoints', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-gdpr-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function buildServer() {
    const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'));
    const db = JSON.parse(JSON.stringify(baseDb)) as Database;
    const dbPath = path.join(caseDir, 'db.json');
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    const registryPath = path.join(caseDir, 'profile_registry.json');
    const registry = createEmptyRegistry();
    ensureProfileRecord(registry, {
      id: profileId,
      displayName: 'GDPR Test',
    });
    await saveProfileRegistry(registryPath, registry);

    const app = express();
    registerGdprRoutes(app, {
      authMiddleware: (req, res, next) => {
        if (req.get('Authorization') !== `Bearer ${LEGACY_TOKEN}`) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        next();
      },
      db,
      dbFilePath: dbPath,
      registry,
      registryPath,
      saveRegistry: saveProfileRegistry,
      withFileLock: async (_file, callback) => callback(),
      logError: () => {},
    });

    return { app, dbPath, registry };
  }

  it('exports profile data with linked usage stats and corrections', async () => {
    const { app } = await buildServer();

    const response = await request(app)
      .get(`/api/v1/profiles/${profileId}/export`)
      .set('Authorization', `Bearer ${LEGACY_TOKEN}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    const zip = new AdmZip(response.body as Buffer);
    const entry = zip.getEntry('profile.json');
    expect(entry).toBeTruthy();
    const payload = JSON.parse(entry!.getData().toString('utf8')) as {
      profile: { id: string; displayName: string };
      usageStats: Array<{ profileId: string; symbolId: string }>;
      corrections: Array<{ profileId: string; predictedSign: string }>;
    };
    expect(payload.profile).toMatchObject({ id: profileId, displayName: 'GDPR Test' });
    expect(payload.usageStats).toEqual([
      expect.objectContaining({ profileId, symbolId: 'hello' }),
    ]);
    expect(payload.corrections).toEqual([
      expect.objectContaining({ profileId, predictedSign: 'hello' }),
    ]);
  });

  it('returns 404 when exporting a missing profile', async () => {
    const { app } = await buildServer();

    await request(app)
      .get('/api/v1/profiles/00000000-0000-4000-8000-000000000000/export')
      .set('Authorization', `Bearer ${LEGACY_TOKEN}`)
      .expect(404);
  });

  it('deletes profile data and persists removal to disk', async () => {
    const { app, dbPath, registry } = await buildServer();

    await request(app)
      .delete(`/api/v1/profiles/${profileId}`)
      .set('Authorization', `Bearer ${LEGACY_TOKEN}`)
      .expect(200)
      .expect({ status: 'deleted' });

    const raw = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(raw) as Database;
    expect(parsed.profiles.find((p) => p.id === profileId)).toBeUndefined();
    expect(parsed.usageStats.find((s) => s.profileId === profileId)).toBeUndefined();
    expect(parsed.corrections.find((c) => c.profileId === profileId)).toBeUndefined();
    expect(registry.profiles.find((p) => p.id === profileId)).toBeUndefined();

    await request(app)
      .get(`/api/v1/profiles/${profileId}/export`)
      .set('Authorization', `Bearer ${LEGACY_TOKEN}`)
      .expect(404);
  });
});
