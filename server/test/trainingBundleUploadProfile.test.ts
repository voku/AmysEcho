import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import request from 'supertest';
import express from 'express';
import { AuthService } from '../src/services/authService.js';

const TEST_PROFILE_ID = '22222222-2222-4222-8222-222222222222';

function buildTestLandmarks(): number[][] {
  return Array.from({ length: 42 }, (_, idx) => {
    const base = idx / 100;
    return [base, base, base / 2];
  });
}

function buildTestBundle(profileId: string, label: string): Buffer {
  const landmarks = buildTestLandmarks();
  const metadata = {
    profileId,
    label,
    capturedAt: new Date().toISOString(),
    source: 'web://mediapipe',
    modalities: {
      hands: { present: true, frameCount: 1, coverage: 1 },
      pose: { present: false, frameCount: 0, coverage: 0 },
      face: { present: false, frameCount: 0, coverage: 0 },
      nonManual: { present: false, frameCount: 0, coverage: 0 },
    },
    smoothing: { method: 'one_euro', beta: 0.01 },
    handedness: { labels: ['Right'], frameCount: 1 },
  };
  const zip = new AdmZip();
  zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
  zip.addFile(
    'landmarks.json',
    Buffer.from(
      JSON.stringify({
        frames: [{ landmarks, handedness: ['Right'] }],
        metadata: {
          modalities: metadata.modalities,
          handedness: metadata.handedness,
          smoothing: { method: 'one_euro' },
        },
      }, null, 2),
    ),
  );
  return zip.toBuffer();
}

describe('Training bundle upload profile resolution', () => {
  let accessToken: string;

  beforeAll(() => {
    accessToken = AuthService.generateTokens({
      id: 'bundle-tester',
      username: 'bundle',
      role: 'caregiver',
    }).accessToken;
  });

  it('returns 422 (not 404) when profile is not found', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-upload-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    jest.resetModules();

    const mod = await import('../src/routes/trainingBundleRoute.js');
    const app = express();
    let counter = 0;
    mod.registerTrainingBundleRoute(app, () => `bundle-${++counter}`, {
      triggerTrainingJob: () => ({ jobId: 'j-1', status: 'queued' }),
      resolveProfileId: async () => ({ profileId: null }),
      isProfileAuthorized: () => true,
    });

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(buildTestBundle(TEST_PROFILE_ID, 'HALLO'));

    expect(response.status).toBe(422);
    expect(response.body).toHaveProperty('error', 'Profil nicht gefunden.');

    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
  });

  it('accepts upload when resolveProfileId auto-creates the profile', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-upload-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    jest.resetModules();

    const mod = await import('../src/routes/trainingBundleRoute.js');
    const app = express();
    let counter = 0;
    mod.registerTrainingBundleRoute(app, () => `bundle-${++counter}`, {
      triggerTrainingJob: () => ({ jobId: 'j-2', status: 'queued' }),
      resolveProfileId: async (profileId) => ({ profileId }),
      isProfileAuthorized: () => true,
    });

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(buildTestBundle(TEST_PROFILE_ID, 'HALLO'));

    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('status', 'queued');

    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
  });
});
