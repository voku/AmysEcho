import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import type { registerTrainingBundleRoute as RegisterTrainingBundleRoute } from '../src/routes/trainingBundleRoute.js';
import { AuthService } from '../src/services/authService.js';

const repoRoot = path.basename(process.cwd()) === 'server'
  ? path.resolve(process.cwd(), '..')
  : process.cwd();
const SAMPLES_PATH = path.join(repoRoot, 'server', 'data', 'dgs_samples.json');

async function loadSampleLandmarks(): Promise<number[][]> {
  try {
    const raw = await fs.readFile(SAMPLES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.samples || parsed.samples.length === 0) {
      throw new Error('No sample landmarks available');
    }
    const first = parsed.samples[0];
    if (!Array.isArray(first.landmarks)) {
      throw new Error('Sample landmarks missing');
    }
    return first.landmarks as number[][];
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    return Array.from({ length: 42 }, (_, idx) => {
      const base = idx / 100;
      return [base, base, base / 2];
    });
  }
}

describe('POST /api/v1/dgs/sample-bundles', () => {
  let app: Express;
  let dataDir: string;
  let manifestPath: string;
  type TriggerCall = { bundleId: string; profileId: string | null; label: string };
  type TriggerResult = { jobId: string; status: string; pollUrl?: string };
  let triggerCalls: TriggerCall[];
  let triggerOverride: ((context: TriggerCall) => TriggerResult | null | undefined) | null;
  let accessToken: string;
  async function getBucketEntries(bucket: string): Promise<string[] | null> {
    if (!dataDir) {
      return null;
    }
    const dir = path.join(dataDir, 'uploads', bucket);
    try {
      return await fs.readdir(dir);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-bundle-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    jest.resetModules();
    accessToken = AuthService.generateTokens({
      id: 'bundle-tester',
      username: 'bundle',
      role: 'caregiver',
    }).accessToken;
    const mod = await import('../src/routes/trainingBundleRoute.js');
    const registerRoute: RegisterTrainingBundleRoute = mod.registerTrainingBundleRoute;
    const { TRAINING_MANIFEST_PATH } = await import('../src/constants/modelPaths.js');
    app = express();
    let counter = 0;
    triggerCalls = [];
    triggerOverride = null;
    registerRoute(app, () => `bundle-${++counter}`, {
      triggerTrainingJob: (context) => {
        triggerCalls.push(context);
        if (triggerOverride) {
          return triggerOverride(context);
        }
        const jobId = `job-${triggerCalls.length}`;
        return { jobId, status: 'queued', pollUrl: `/api/v1/train-status/${jobId}` };
      },
    });
    manifestPath = TRAINING_MANIFEST_PATH;
  });

  beforeEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.mkdir(dataDir, { recursive: true });
    await fs.rm(path.dirname(manifestPath), { recursive: true, force: true });
    triggerCalls.length = 0;
    triggerOverride = null;
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
  });

  it('stores manifest entry for zipped training bundle and strips unknown metadata fields', async () => {
    const metadata = {
      profileId: 'p-test-123',
      label: 'HILFE',
      capturedAt: '2024-05-28T12:03:11Z',
      source: 'app://mediapipe',
      clipFilename: 'clip.webm',
      stillFilename: 'still.jpg',
      extra: 'ignored',
      modalities: {
        hands: { present: true, frameCount: 1, coverage: 1 },
        pose: { present: false, frameCount: 0, coverage: 0 },
        face: { present: false, frameCount: 0, coverage: 0 },
      },
      smoothing: { method: 'one_euro', beta: 0.1 },
      handedness: { labels: ['Left'], frameCount: 1 },
    };
    const landmarks = await loadSampleLandmarks();

    const zip = new AdmZip();
    zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    zip.addFile(
      'bundle/landmarks.json',
      Buffer.from(
        JSON.stringify(
          {
            frames: [{ landmarks, handedness: ['Left'] }],
            metadata: {
              modalities: metadata.modalities,
              handedness: metadata.handedness,
              smoothing: { method: 'one_euro' },
            },
          },
          null,
          2,
        ),
      ),
    );
    zip.addFile('bundle/clip.webm', Buffer.from('fake-video-data'));
    zip.addFile('bundle/still.jpg', Buffer.from('fake-image-data'));

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer())
      .expect(202);

    expect(response.body).toHaveProperty('status', 'queued');
    expect(typeof response.body.id).toBe('string');
    expect(response.body.trainingJob).toEqual({
      jobId: 'job-1',
      status: 'queued',
      pollUrl: '/api/v1/train-status/job-1',
    });

    expect(triggerCalls).toEqual([
      { bundleId: response.body.id, profileId: metadata.profileId, label: metadata.label },
    ]);

    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as {
      entries: Array<{
        id: string;
        profileId: string | null;
        label: string;
        storage: { directory: string; bundle: string; files: string[]; clip?: string };
        metadata: any;
      }>;
    };

    expect(Array.isArray(manifest.entries)).toBe(true);
    expect(manifest.entries.length).toBe(1);
    const entry = manifest.entries[0];
    expect(entry.id).toBe(response.body.id);
    expect(entry.profileId).toBe(metadata.profileId);
    expect(entry.label).toBe(metadata.label);
    expect(entry.storage.files).toEqual(
      expect.arrayContaining([
        'bundle/metadata.json',
        'bundle/landmarks.json',
        'bundle/clip.webm',
        'bundle/still.jpg',
      ]),
    );
    expect(entry.storage.clip).toBe('bundle/clip.webm');
    expect(entry.storage.still).toBe('bundle/still.jpg');
    expect(entry.metadata).toEqual({
      label: metadata.label,
      profileId: metadata.profileId,
      capturedAt: metadata.capturedAt,
      source: metadata.source,
      clipFilename: metadata.clipFilename,
      stillFilename: metadata.stillFilename,
      modalities: metadata.modalities,
      smoothing: expect.objectContaining({ method: 'one_euro' }),
      handedness: metadata.handedness,
      validationSummary: {
        frameCount: 1,
        landmarksPath: 'bundle/landmarks.json',
      },
    });

    const storedDir = path.join(dataDir, entry.storage.directory);
    const storedMetadataRaw = await fs.readFile(path.join(storedDir, 'bundle', 'metadata.json'), 'utf8');
    const storedMetadata = JSON.parse(storedMetadataRaw);
    expect(storedMetadata).toMatchObject(metadata);

    const storedLandmarksRaw = await fs.readFile(path.join(storedDir, 'bundle', 'landmarks.json'), 'utf8');
    const storedLandmarks = JSON.parse(storedLandmarksRaw);
    expect(storedLandmarks.frames[0].landmarks[0]).toEqual(landmarks[0]);
    expect(storedLandmarks.metadata.handedness).toEqual(metadata.handedness);

    const bundleZipPath = path.join(dataDir, entry.storage.bundle);
    const bundleStat = await fs.stat(bundleZipPath);
    expect(bundleStat.isFile()).toBe(true);
  });

  it('stores handFocus metadata when provided', async () => {
    const metadata = {
      profileId: 'p-focus-test',
      label: 'PAPA',
      capturedAt: '2024-05-28T12:03:11Z',
      source: 'app://mediapipe',
      handFocus: 'dominant_only',  // Only dominant hand is important for this gesture
    };
    const landmarks = await loadSampleLandmarks();

    const zip = new AdmZip();
    zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    zip.addFile(
      'bundle/landmarks.json',
      Buffer.from(
        JSON.stringify(
          {
            frames: [{ landmarks, handedness: ['Right'] }],
          },
          null,
          2,
        ),
      ),
    );

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer())
      .expect(202);

    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as {
      entries: Array<{
        id: string;
        metadata: any;
      }>;
    };

    const entry = manifest.entries[0];
    expect(entry.metadata.handFocus).toBe('dominant_only');
  });

  it('omits training job payload when trigger returns null but keeps queued status', async () => {
    triggerOverride = () => null;
    const metadata = {
      label: 'SPASS',
      profileId: 'p-legacy',
      clipFilename: 'clip.webm',
      stillFilename: 'still.jpg',
    };
    const landmarks = await loadSampleLandmarks();
    const zip = new AdmZip();
    zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    zip.addFile(
      'bundle/landmarks.json',
      Buffer.from(
        JSON.stringify(
          {
            frames: [{ landmarks }],
          },
          null,
          2,
        ),
      ),
    );
    zip.addFile('bundle/clip.webm', Buffer.from('fake-video-data'));
    zip.addFile('bundle/still.jpg', Buffer.from('fake-image-data'));

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer())
      .expect(202);

    expect(response.body.status).toBe('queued');
    expect(response.body.trainingJob).toBeNull();
  });

  it('rejects bundles missing landmarks.json and removes partially extracted directory', async () => {
    const zip = new AdmZip();
    zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify({ label: 'HILFE' }, null, 2)));

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer());

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('landmarks.json missing or invalid');
    await expect(fs.access(manifestPath)).rejects.toMatchObject({ code: 'ENOENT' });

    const bucketEntries = await getBucketEntries('unassigned');
    if (bucketEntries) {
      expect(bucketEntries).toHaveLength(0);
    }
  });

  it('rejects bundles whose landmarks.json has no frames and cleans up bundle directory', async () => {
    const metadata = { label: 'HILFE', profileId: 'p-test-42' };
    const zip = new AdmZip();
    zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    zip.addFile(
      'bundle/landmarks.json',
      Buffer.from(
        JSON.stringify(
          {
            frames: [
              { landmarks: [] },
            ],
          },
          null,
          2,
        ),
      ),
    );

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer());

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('landmarks.json missing or invalid');
    await expect(fs.access(manifestPath)).rejects.toMatchObject({ code: 'ENOENT' });

    const bucketEntries = await getBucketEntries(metadata.profileId!);
    if (bucketEntries) {
      expect(bucketEntries).toHaveLength(0);
    }
  });

  it('rejects unauthenticated upload', async () => {
    const zip = new AdmZip();
    zip.addFile('metadata.json', Buffer.from(JSON.stringify({ label: 'HILFE' })));

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer());

    expect(response.status).toBe(401);
    await expect(fs.access(manifestPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects bundles containing traversal entries', async () => {
    const zip = new AdmZip();
    zip.addFile('../metadata.json', Buffer.from(JSON.stringify({ label: 'BAD' })));
    zip.addFile('../clip.mp4', Buffer.from('bad'));
    const entries = zip.getEntries();
    if (entries[0]) entries[0].entryName = '../metadata.json';
    if (entries[1]) entries[1].entryName = '../clip.mp4';
    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer());

    expect(response.status).toBe(400);
    await expect(fs.access(manifestPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects bundles that try to overwrite the archived bundle.zip copy', async () => {
    const metadata = {
      label: 'HILFE',
    };
    const zip = new AdmZip();
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata)));
    zip.addFile('bundle.zip', Buffer.from('malicious'));

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer());

    expect(response.status).toBe(400);
    await expect(fs.access(manifestPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns 500 when existing manifest is corrupted and leaves it untouched', async () => {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    const corrupted = JSON.stringify({ entries: 'not-an-array' });
    await fs.writeFile(manifestPath, corrupted, 'utf8');

    const metadata = {
      profileId: 'p-test-123',
      label: 'HILFE',
    };
    const zip = new AdmZip();
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata)));
    const landmarks = await loadSampleLandmarks();
    zip.addFile(
      'landmarks.json',
      Buffer.from(
        JSON.stringify(
          {
            frames: [{ landmarks }],
          },
          null,
          2,
        ),
      ),
    );

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer());

    expect(response.status).toBe(500);
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    expect(manifestRaw).toBe(corrupted);
  });
});
