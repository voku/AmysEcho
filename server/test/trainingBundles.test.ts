import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import type { registerTrainingBundleRoute as RegisterTrainingBundleRoute } from '../src/routes/trainingBundleRoute.js';
import { AuthService } from '../src/services/authService.js';

async function loadSampleLandmarks(): Promise<number[][]> {
  return Array.from({ length: 42 }, (_, idx) => {
    const base = idx / 100;
    return [base, base, base / 2];
  });
}

describe('POST /api/v1/dgs/sample-bundles', () => {
  let app: Express;
  let dataDir: string;
  type TriggerCall = { bundleId: string; profileId: string | null; label: string };
  type TriggerResult = {
    jobId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    pollUrl?: string;
  };
  let triggerCalls: TriggerCall[];
  let triggerOverride: ((context: TriggerCall) => TriggerResult | null | undefined) | null;
  let manifestUpdatedCalls: number;
  let accessToken: string;
  let dbPath: string;
  let isProfileAuthorized: (profileId: string) => boolean;
  const resolveProfileId = async (profileId: string | null) => ({
    profileId,
  });
  const getResolvedProfileId = (profileId?: string | null) => profileId ?? null;
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

  async function readManifestEntries(): Promise<Array<Record<string, unknown>>> {
    const { loadTrainingManifest } = await import('../src/services/trainingJsonStore.js');
    return loadTrainingManifest<Record<string, unknown>>().entries;
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
    isProfileAuthorized = () => true;
    const mod = await import('../src/routes/trainingBundleRoute.js');
    const registerRoute = mod.registerTrainingBundleRoute;
    const { loadDatabase } = await import('../src/db.js');
    dbPath = path.join(dataDir, `db-${Date.now()}.json`);
    await loadDatabase(dbPath);
    app = express();
    let counter = 0;
    triggerCalls = [];
    triggerOverride = null;
    manifestUpdatedCalls = 0;
    registerRoute(app, () => `bundle-${++counter}`, {
      triggerTrainingJob: (context: TriggerCall) => {
        triggerCalls.push(context);
        if (triggerOverride) {
          return triggerOverride(context);
        }
        const jobId = `job-${triggerCalls.length}`;
        return { jobId, status: 'queued', pollUrl: `/api/v1/train-status/${jobId}` };
      },
      onManifestUpdated: () => {
        manifestUpdatedCalls += 1;
      },
      resolveProfileId,
      isProfileAuthorized: (_req, profileId) => isProfileAuthorized(profileId),
    });
  });

  beforeEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.mkdir(dataDir, { recursive: true });
    const { loadDatabase } = await import('../src/db.js');
    dbPath = path.join(dataDir, `db-${Date.now()}.json`);
    await loadDatabase(dbPath);
    triggerCalls.length = 0;
    triggerOverride = null;
    isProfileAuthorized = () => true;
    manifestUpdatedCalls = 0;
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
  });

  it('stores manifest entry for zipped training bundle and strips unknown metadata fields', async () => {
    const metadata = {
      profileId: '11111111-1111-4111-8111-111111111111',
      label: 'HILFE',
      capturedAt: '2024-05-28T12:03:11Z',
      source: 'app://mediapipe',
      clipFilename: 'clip.webm',
      stillFilename: 'still.jpg',
      recording: {
        frameCount: 12,
        usableFrameCount: 10,
        clipDurationMs: 1200,
        clipBytes: 2048,
        clipMimeType: 'video/webm',
        stillBytes: 512,
        stillMimeType: 'image/jpeg',
      },
      extra: 'ignored',
      modalities: {
        hands: { present: true, frameCount: 1, coverage: 1 },
        pose: { present: false, frameCount: 0, coverage: 0 },
        face: { present: false, frameCount: 0, coverage: 0 },
        nonManual: { present: false, frameCount: 0, coverage: 0 },
      },
      smoothing: { method: 'one_euro', beta: 0.1 },
      handedness: { labels: ['Left'], frameCount: 1 },
      validationSummary: {
        frameCount: 12,
        issues: ['too_few_frames'],
        suggestions: ['Nimm etwas länger auf.'],
        qualityScore: 58,
        confidence: 0.7,
      },
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
    expect(manifestUpdatedCalls).toBe(1);

    expect(response.body).toHaveProperty('status', 'queued');
    expect(typeof response.body.id).toBe('string');
    expect(response.body.trainingJob).toEqual({
      jobId: 'job-1',
      status: 'queued',
      pollUrl: '/api/v1/train-status/job-1',
    });
    expect(response.body.validationSummary).toMatchObject({
      frameCount: 1,
      issues: ['too_few_frames'],
      suggestions: ['Nimm etwas länger auf.'],
      qualityScore: 58,
      confidence: 0.7,
      landmarksPath: 'bundle/landmarks.json',
    });
    expect(response.body.qualityGate).toEqual({
      outcome: 'review',
      reasons: expect.arrayContaining(['too_few_frames', 'quality_score_below_threshold']),
    });

    const resolvedProfileId = getResolvedProfileId(metadata.profileId);
    expect(triggerCalls).toEqual([
      { bundleId: response.body.id, profileId: resolvedProfileId, label: metadata.label },
    ]);

    const manifest = { entries: await readManifestEntries() } as {
      entries: Array<{
        id: string;
        profileId: string | null;
        label: string;
        storage: {
          directory: string;
          bundle: string;
          files: string[];
          clip?: string;
          still?: string;
        };
        metadata: any;
      }>;
    };

    expect(Array.isArray(manifest.entries)).toBe(true);
    expect(manifest.entries.length).toBe(1);
    const entry = manifest.entries[0];
    expect(entry.id).toBe(response.body.id);
    expect(entry.profileId).toBe(resolvedProfileId);
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
      profileId: resolvedProfileId,
      capturedAt: metadata.capturedAt,
      source: metadata.source,
      clipFilename: metadata.clipFilename,
      stillFilename: metadata.stillFilename,
      recording: metadata.recording,
      modalities: metadata.modalities,
      smoothing: expect.objectContaining({ method: 'one_euro' }),
      handedness: metadata.handedness,
      validationSummary: {
        frameCount: 1,
        landmarksPath: 'bundle/landmarks.json',
        issues: ['too_few_frames'],
        suggestions: ['Nimm etwas länger auf.'],
        qualityScore: 58,
        confidence: 0.7,
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

    const metricsRaw = await fs.readFile(
      path.join(dataDir, 'datasets', 'ingestion_metrics.json'),
      'utf8',
    );
    const metrics = JSON.parse(metricsRaw) as {
      totals: {
        uploads: number;
        rejected: number;
        missingModalities: { hands: number; pose: number; face: number; nonManual: number };
        nonManualCoverage: { p50: number; p90: number; sampleCount: number };
        nonManualCoverageSamples: number[];
      };
      profiles: Record<string, {
        uploads: number;
        rejected: number;
        missingModalities: { hands: number; pose: number; face: number; nonManual: number };
        nonManualCoverage: { p50: number; p90: number; sampleCount: number };
        nonManualCoverageSamples: number[];
      }>;
    };
    expect(metrics.totals.uploads).toBe(1);
    expect(metrics.totals.rejected).toBe(0);
    expect(metrics.totals.missingModalities).toEqual({ hands: 0, pose: 1, face: 1, nonManual: 1 });
    expect(metrics.totals.nonManualCoverage).toEqual({ p50: 0, p90: 0, sampleCount: 1 });
    expect(metrics.totals.nonManualCoverageSamples).toEqual([0]);
    expect(metrics.profiles[resolvedProfileId!].uploads).toBe(1);
    expect(metrics.profiles[resolvedProfileId!].rejected).toBe(0);
    expect(metrics.profiles[resolvedProfileId!].missingModalities).toEqual({ hands: 0, pose: 1, face: 1, nonManual: 1 });
    expect(metrics.profiles[resolvedProfileId!].nonManualCoverage).toEqual({ p50: 0, p90: 0, sampleCount: 1 });
    expect(metrics.profiles[resolvedProfileId!].nonManualCoverageSamples).toEqual([0]);
  });




  it('returns bundle details via GET /api/v1/dgs/sample-bundles/:id including quality gate outcome', async () => {
    const metadata = {
      profileId: '99999999-9999-4999-8999-999999999999',
      label: 'HALLO',
      capturedAt: '2024-05-28T12:03:11Z',
      source: 'app://mediapipe',
      validationSummary: {
        frameCount: 2,
        issues: ['landmarks_missing'],
        suggestions: ['Achte auf bessere Beleuchtung.'],
        qualityScore: 82,
        confidence: 0.8,
      },
    };
    const landmarks = await loadSampleLandmarks();

    const zip = new AdmZip();
    zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    zip.addFile(
      'bundle/landmarks.json',
      Buffer.from(
        JSON.stringify(
          {
            frames: [
              { landmarks, handedness: ['Left'] },
              { landmarks, handedness: ['Left'] },
            ],
          },
          null,
          2,
        ),
      ),
    );

    const uploadResponse = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer())
      .expect(202);

    const detailResponse = await request(app)
      .get(`/api/v1/dgs/sample-bundles/${uploadResponse.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detailResponse.body.id).toBe(uploadResponse.body.id);
    expect(detailResponse.body.label).toBe(metadata.label);
    expect(detailResponse.body.validationSummary).toMatchObject({
      frameCount: 2,
      issues: ['landmarks_missing'],
      suggestions: ['Achte auf bessere Beleuchtung.'],
      qualityScore: 82,
      confidence: 0.8,
      landmarksPath: 'bundle/landmarks.json',
    });
    expect(detailResponse.body.metadata).toMatchObject({
      label: metadata.label,
      profileId: metadata.profileId,
    });
    expect(detailResponse.body.qualityGate).toEqual({
      outcome: 'review',
      reasons: expect.arrayContaining(['landmarks_missing', 'too_few_frames']),
    });
  });

  it('derives nonManual modality coverage from frame data when metadata omits it', async () => {
    const metadata = {
      profileId: '44444444-4444-4444-8444-444444444444',
      label: 'FARBE',
      capturedAt: '2024-05-28T12:03:11Z',
      source: 'app://mediapipe',
      modalities: {
        hands: { present: true, frameCount: 2, coverage: 1 },
        pose: { present: true, frameCount: 2, coverage: 1 },
        face: { present: true, frameCount: 2, coverage: 1 },
      },
    };
    const landmarks = await loadSampleLandmarks();

    const zip = new AdmZip();
    zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    zip.addFile(
      'bundle/landmarks.json',
      Buffer.from(
        JSON.stringify(
          {
            frames: [
              {
                landmarks,
                handedness: ['Right'],
                poseLandmarks: [[0, 0, 0]],
                faceLandmarks: [[0, 0, 0]],
                nonManualFeatures: { eyebrowRaiseLeft: 0.7, source: 'face' },
              },
              {
                landmarks,
                handedness: ['Right'],
                poseLandmarks: [[0, 0, 0]],
                faceLandmarks: [[0, 0, 0]],
              },
            ],
            metadata: {
              modalities: metadata.modalities,
            },
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

    const manifest = { entries: await readManifestEntries() } as {
      entries: Array<{
        id: string;
        metadata: {
          modalities: {
            nonManual: { present: boolean; frameCount: number; coverage: number };
          };
        };
      }>;
    };

    const entry = manifest.entries.find((candidate) => candidate.id === response.body.id);
    expect(entry).toBeDefined();
    expect(entry!.metadata.modalities.nonManual).toEqual({
      present: true,
      frameCount: 1,
      coverage: 0.5,
    });
  });

  it('stores handFocus and mirror augmentation metadata when provided', async () => {
    const metadata = {
      profileId: '22222222-2222-4222-8222-222222222222',
      label: 'PAPA',
      capturedAt: '2024-05-28T12:03:11Z',
      source: 'app://mediapipe',
      handFocus: 'both_equal',
      augmentation: {
        mirrorSafe: true,
      },
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

    const manifest = { entries: await readManifestEntries() } as {
      entries: Array<{
        id: string;
        metadata: any;
      }>;
    };

    const entry = manifest.entries[0];
    expect(entry.metadata.handFocus).toBe('both_equal');
    expect(entry.metadata.augmentation).toEqual({ mirrorSafe: true });
  });

  it('omits training job payload when trigger returns null but keeps queued status', async () => {
    triggerOverride = () => null;
    const metadata = {
      label: 'SPASS',
      profileId: '33333333-3333-4333-8333-333333333333',
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
    expect(manifestUpdatedCalls).toBe(0);

    const bucketEntries = await getBucketEntries('unassigned');
    if (bucketEntries) {
      expect(bucketEntries).toHaveLength(0);
    }
  });

  it('rejects bundles with invalid nonManualFeatures payload', async () => {
    const metadata = {
      profileId: '66666666-6666-4666-8666-666666666666',
      label: 'HILFE',
    };
    const landmarks = await loadSampleLandmarks();

    const zip = new AdmZip();
    zip.addFile('bundle/metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    zip.addFile(
      'bundle/landmarks.json',
      Buffer.from(
        JSON.stringify(
          {
            frames: [{ landmarks, nonManualFeatures: { headYaw: 'invalid' } }],
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
  });

  it('rejects bundles whose landmarks.json has no frames and cleans up bundle directory', async () => {
    const metadata = { label: 'HILFE', profileId: '44444444-4444-4444-8444-444444444444' };
    const resolvedProfileId = getResolvedProfileId(metadata.profileId);
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

    const bucketEntries = await getBucketEntries(resolvedProfileId!);
    if (bucketEntries) {
      expect(bucketEntries).toHaveLength(0);
    }

    const metricsRaw = await fs.readFile(
      path.join(dataDir, 'datasets', 'ingestion_metrics.json'),
      'utf8',
    );
    const metrics = JSON.parse(metricsRaw) as {
      totals: {
        uploads: number;
        rejected: number;
        missingModalities: { hands: number; pose: number; face: number; nonManual: number };
        nonManualCoverage: { p50: number; p90: number; sampleCount: number };
        nonManualCoverageSamples: number[];
      };
      profiles: Record<string, {
        uploads: number;
        rejected: number;
        nonManualCoverage: { p50: number; p90: number; sampleCount: number };
        nonManualCoverageSamples: number[];
      }>;
    };
    expect(metrics.totals.uploads).toBe(0);
    expect(metrics.totals.rejected).toBe(1);
    expect(metrics.profiles[resolvedProfileId!].uploads).toBe(0);
    expect(metrics.profiles[resolvedProfileId!].rejected).toBe(1);
  });

  it('rejects unauthenticated upload', async () => {
    const zip = new AdmZip();
    zip.addFile('metadata.json', Buffer.from(JSON.stringify({ label: 'HILFE' })));

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer());

    expect(response.status).toBe(401);
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
  });

  it('liefert Quality-Gate-Ablehnungen über GET /api/v1/dgs/training-quality', async () => {
    const { saveTrainingQualityLog } = await import('../src/services/trainingJsonStore.js');
    saveTrainingQualityLog({
      entries: [
        {
          bundleId: 'bundle-old',
          label: 'HILFE',
          profileId: 'profile-a',
          reasons: ['too_few_frames'],
          metrics: { frameCount: 8, handCoverage: 0.4, poseCoverage: 0.8, faceCoverage: 0.7 },
          recordedAt: '2026-01-01T10:00:00.000Z',
        },
        {
          bundleId: 'bundle-new',
          label: 'ESSEN',
          profileId: 'profile-b',
          reasons: ['hand_jitter_too_high'],
          metrics: { frameCount: 14, handCoverage: 1, poseCoverage: 1, faceCoverage: 1, handJitter: 0.8 },
          recordedAt: '2026-01-01T12:00:00.000Z',
        },
      ],
    });

    const response = await request(app)
      .get('/api/v1/dgs/training-quality?profileId=profile-b&limit=5')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        expect.objectContaining({
          bundleId: 'bundle-new',
          label: 'ESSEN',
          profileId: 'profile-b',
          reasons: ['hand_jitter_too_high'],
        }),
      ],
    });
  });


  it('liefert ohne Profilfilter nur berechtigte Profile', async () => {
    const { saveTrainingQualityLog } = await import('../src/services/trainingJsonStore.js');
    saveTrainingQualityLog({
      entries: [
        {
          bundleId: 'bundle-a',
          label: 'HILFE',
          profileId: 'profile-a',
          reasons: ['too_few_frames'],
          metrics: { frameCount: 8, handCoverage: 0.4, poseCoverage: 0.8, faceCoverage: 0.7 },
          recordedAt: '2026-01-01T10:00:00.000Z',
        },
        {
          bundleId: 'bundle-b',
          label: 'ESSEN',
          profileId: 'profile-b',
          reasons: ['hand_jitter_too_high'],
          metrics: { frameCount: 14, handCoverage: 1, poseCoverage: 1, faceCoverage: 1, handJitter: 0.8 },
          recordedAt: '2026-01-01T12:00:00.000Z',
        },
        {
          bundleId: 'bundle-null',
          label: 'TRINKEN',
          profileId: null,
          reasons: ['too_few_frames'],
          metrics: { frameCount: 5, handCoverage: 0.1, poseCoverage: 0.1, faceCoverage: 0.1 },
          recordedAt: '2026-01-01T13:00:00.000Z',
        },
      ],
    });

    isProfileAuthorized = (profileId) => profileId === 'profile-b';

    const response = await request(app)
      .get('/api/v1/dgs/training-quality?limit=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        expect.objectContaining({
          bundleId: 'bundle-b',
          profileId: 'profile-b',
        }),
      ],
    });
  });

  it('validiert Query-Parameter für GET /api/v1/dgs/training-quality', async () => {
    const response = await request(app)
      .get('/api/v1/dgs/training-quality?limit=0')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    expect(response.body.error).toBe('Ungültige Anfrageparameter');
    expect(response.body.code).toBe('INVALID_QUERY');
    expect(Array.isArray(response.body.issues)).toBe(true);
  });

  it('verweigert Quality-Log-Antworten ohne Profilberechtigung', async () => {
    isProfileAuthorized = () => false;

    const response = await request(app)
      .get('/api/v1/dgs/training-quality?profileId=profile-a')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body).toEqual({
      error: 'Kein Zugriff auf dieses Profil.',
      code: 'PROFILE_UNAUTHORIZED',
    });
  });

});
