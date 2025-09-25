import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import type { registerTrainingBundleRoute as RegisterTrainingBundleRoute } from '../src/routes/trainingBundleRoute.js';

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

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-bundle-'));
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    process.env.API_TOKEN = 'bundle-token';
    const mod = await import('../src/routes/trainingBundleRoute.js');
    const registerRoute: RegisterTrainingBundleRoute = mod.registerTrainingBundleRoute;
    app = express();
    let counter = 0;
    registerRoute(app, () => `bundle-${++counter}`);
    manifestPath = path.join(dataDir, 'datasets', 'training_manifest.json');
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.AMY_ECHO_DATA_DIR;
    delete process.env.API_TOKEN;
  });

  it('stores manifest entry for zipped training bundle', async () => {
    const metadata = {
      profileId: 'p-test-123',
      label: 'HILFE',
      capturedAt: '2024-05-28T12:03:11Z',
      source: 'app://mediapipe',
    };
    const landmarks = await loadSampleLandmarks();

    const zip = new AdmZip();
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));
    zip.addFile('landmarks.json', Buffer.from(JSON.stringify({ landmarks }, null, 2)));
    zip.addFile('clip.mp4', Buffer.from('fake-video-data'));

    const response = await request(app)
      .post('/api/v1/dgs/sample-bundles')
      .set('Authorization', 'Bearer bundle-token')
      .set('Content-Type', 'application/zip')
      .send(zip.toBuffer())
      .expect(202);

    expect(response.body).toHaveProperty('status', 'queued');
    expect(typeof response.body.id).toBe('string');

    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as {
      entries: Array<{
        id: string;
        profileId: string | null;
        label: string;
        storage: { directory: string; bundle: string; files: string[] };
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
      expect.arrayContaining(['metadata.json', 'landmarks.json', 'clip.mp4']),
    );
    expect(entry.metadata).toMatchObject(metadata);

    const storedDir = path.join(dataDir, entry.storage.directory);
    const storedMetadataRaw = await fs.readFile(path.join(storedDir, 'metadata.json'), 'utf8');
    const storedMetadata = JSON.parse(storedMetadataRaw);
    expect(storedMetadata).toMatchObject(metadata);

    const storedLandmarksRaw = await fs.readFile(path.join(storedDir, 'landmarks.json'), 'utf8');
    const storedLandmarks = JSON.parse(storedLandmarksRaw);
    expect(storedLandmarks.landmarks[0]).toEqual(landmarks[0]);

    const bundleZipPath = path.join(dataDir, entry.storage.bundle);
    const bundleStat = await fs.stat(bundleZipPath);
    expect(bundleStat.isFile()).toBe(true);
  });
});
