import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

import type { Database } from '../src/db.js';
import { deleteProfileData, getProfileData } from '../src/db.js';
import { registerGdprRoutes } from '../src/routes/gdprRoutes.js';

const LEGACY_TOKEN = 'gdpr-token';

const baseDb: Database = {
  symbols: [],
  gestureDefinitions: [],
  gestureTrainingData: [],
  interactionLogs: [],
  profiles: [
    {
      id: 'gdpr',
      name: 'GDPR Test',
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
    { id: 'stat-1', symbolId: 'hello', profileId: 'gdpr', count: 3 },
  ],
  learningAnalytics: [],
  corrections: [
    {
      id: 'corr-1',
      predictedGesture: 'hello',
      actualGesture: 'hallo',
      confidence: 0.42,
      timestamp: 1728920000000,
      isSynced: false,
      profileId: 'gdpr',
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
      getProfileData,
      deleteProfileData,
      withFileLock: async (_file, callback) => callback(),
      logError: () => {},
    });

    return { app, dbPath };
  }

  it('exports profile data with linked usage stats and corrections', async () => {
    const { app } = await buildServer();

    const response = await request(app)
      .get('/api/v1/profiles/gdpr/export')
      .set('Authorization', `Bearer ${LEGACY_TOKEN}`)
      .expect(200);

    expect(response.body.profile).toMatchObject({ id: 'gdpr', name: 'GDPR Test' });
    expect(response.body.usageStats).toEqual([
      expect.objectContaining({ profileId: 'gdpr', symbolId: 'hello' }),
    ]);
    expect(response.body.corrections).toEqual([
      expect.objectContaining({ profileId: 'gdpr', predictedGesture: 'hello' }),
    ]);
  });

  it('returns 404 when exporting a missing profile', async () => {
    const { app } = await buildServer();

    await request(app)
      .get('/api/v1/profiles/unknown/export')
      .set('Authorization', `Bearer ${LEGACY_TOKEN}`)
      .expect(404);
  });

  it('deletes profile data and persists removal to disk', async () => {
    const { app, dbPath } = await buildServer();

    await request(app)
      .delete('/api/v1/profiles/gdpr')
      .set('Authorization', `Bearer ${LEGACY_TOKEN}`)
      .expect(200)
      .expect({ status: 'deleted' });

    const raw = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(raw) as Database;
    expect(parsed.profiles.find((p) => p.id === 'gdpr')).toBeUndefined();
    expect(parsed.usageStats.find((s) => s.profileId === 'gdpr')).toBeUndefined();
    expect(parsed.corrections.find((c) => c.profileId === 'gdpr')).toBeUndefined();

    await request(app)
      .get('/api/v1/profiles/gdpr/export')
      .set('Authorization', `Bearer ${LEGACY_TOKEN}`)
      .expect(404);
  });
});
