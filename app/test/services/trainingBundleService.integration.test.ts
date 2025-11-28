/**
 * @jest-environment node
 */
import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { unzipSync, strFromU8 } from 'fflate';

import type { TrainingFrame } from '../../src/storage';

async function loadSampleFrame(): Promise<TrainingFrame> {
  const repoRoot = path.resolve(__dirname, '../../..');
  const samplePath = path.join(repoRoot, 'server', 'data', 'dgs_samples.json');

  const buildFallback = (): TrainingFrame => {
    const fallback = Array.from({ length: 42 }, (_, idx) => {
      const base = idx / 100;
      return [base, base, base / 2];
    });
    return {
      landmarks: [fallback.slice(0, 21), fallback.slice(21, 42)],
      handedness: ['Left', 'Right'],
    };
  };

  try {
    const raw = await fs.readFile(samplePath, 'utf8');
    const parsed = JSON.parse(raw);
    const sample = parsed?.samples?.[0];
    const landmarks = Array.isArray(sample?.landmarks) ? sample.landmarks : null;
    if (!landmarks || landmarks.length < 42) {
      return buildFallback();
    }
    return {
      landmarks: [landmarks.slice(0, 21), landmarks.slice(21, 42)],
      handedness: ['Left', 'Right'],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return buildFallback();
  }
}

jest.mock('../../src/constants', () => ({
  API_URL: 'http://127.0.0.1:0',
}));

jest.mock('../../src/storage', () => ({
  __esModule: true,
  loadBackendApiToken: jest.fn(async () => 'bundle-token'),
}));

let fsTempRoot: string;

jest.mock('expo-file-system', () => {
  const { promises: fsp } = require('fs');
  const os = require('os');
  const path = require('path');
  const { URL } = require('url');
  const { unzipSync, strFromU8 } = require('fflate');

  const root = require('fs').mkdtempSync(path.join(os.tmpdir(), 'expo-fs-'));
  fsTempRoot = root;

  function toPath(uri: string): string {
    if (!uri) return root;
    if (uri.startsWith('file://')) {
      return new URL(uri).pathname;
    }
    return uri;
  }

  async function ensureDir(uri: string): Promise<void> {
    await fsp.mkdir(path.dirname(toPath(uri)), { recursive: true });
  }

  async function writeAsStringAsync(
    uri: string,
    data: string,
    options?: { encoding?: string },
  ): Promise<void> {
    await ensureDir(uri);
    await fsp.writeFile(toPath(uri), data, options?.encoding ?? 'utf8');
  }

  async function makeDirectoryAsync(uri: string): Promise<void> {
    await fsp.mkdir(toPath(uri), { recursive: true });
  }

  async function copyAsync({ from, to }: { from: string; to: string }): Promise<void> {
    await ensureDir(to);
    await fsp.copyFile(toPath(from), toPath(to));
  }

  async function deleteAsync(uri: string): Promise<void> {
    await fsp.rm(toPath(uri), { recursive: true, force: true });
  }

  async function getInfoAsync(uri: string): Promise<{ exists: boolean; isDirectory: boolean }>{
    try {
      const stat = await fsp.stat(toPath(uri));
      return { exists: true, isDirectory: stat.isDirectory() };
    } catch {
      return { exists: false, isDirectory: false };
    }
  }

  async function uploadAsync(url: string, fileUri: string, options: any = {}): Promise<any> {
    const buffer = await fsp.readFile(toPath(fileUri));
    const response = await fetch(url, {
      method: options.httpMethod ?? 'POST',
      headers: options.headers,
      body: buffer,
    });
    const bodyText = await response.text();
    return {
      status: response.status,
      body: bodyText,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }

  async function readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string> {
    const encoding = options?.encoding ?? 'utf8';
    return fsp.readFile(toPath(uri), encoding);
  }

  return {
    cacheDirectory: `file://${root}/`,
    documentDirectory: `file://${root}/`,
    writeAsStringAsync,
    makeDirectoryAsync,
    copyAsync,
    uploadAsync,
    deleteAsync,
    getInfoAsync,
    readAsStringAsync,
    FileSystemUploadType: { BINARY_CONTENT: 0 },
    EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  };
});

import { uploadTrainingBundle } from '../../src/services/trainingBundleService';

const manifestPath = () => path.join(fsTempRoot, 'training_manifest.json');

function createServer(port: number, manifestFile: string) {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/v1/dgs/sample-bundles') {
      res.statusCode = 404;
      res.end('not-found');
      return;
    }

    if (req.headers.authorization !== 'Bearer bundle-token') {
      res.statusCode = 401;
      res.end('unauthorized');
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const files = unzipSync(new Uint8Array(buffer));
        const metaRaw = files['metadata.json'];
        const landmarksRaw = files['landmarks.json'];
        if (!metaRaw || !landmarksRaw) {
          res.statusCode = 400;
          res.end('missing files');
          return;
        }
        const metadata = JSON.parse(strFromU8(metaRaw));
        const landmarks = JSON.parse(strFromU8(landmarksRaw));
        const id = `bundle-${Date.now()}`;
        let manifest = { entries: [] as any[] };
        try {
          const existing = await fs.readFile(manifestFile, 'utf8');
          manifest = JSON.parse(existing);
          if (!Array.isArray(manifest.entries)) {
            manifest.entries = [];
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
        manifest.entries.push({
          id,
          metadata,
          files: Object.keys(files),
          frames: landmarks.frames,
        });
        await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');
        res.statusCode = 202;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'queued', id }));
      } catch (error) {
        res.statusCode = 500;
        console.error(error);
        res.end('Internal server error');
      }
    });
  });
}

describe('uploadTrainingBundle spike', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const manifestDir = path.dirname(manifestPath());
    await fs.mkdir(manifestDir, { recursive: true });
    server = createServer(0, manifestPath());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server konnte nicht gestartet werden');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(fsTempRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await fs.rm(manifestPath(), { force: true });
  });

  it('zips landmarks and clip into a bundle and registers manifest entry', async () => {
    const clipPath = path.join(fsTempRoot, 'clip.webm');
    await fs.writeFile(clipPath, Buffer.from('clip-data'), 'utf8');
    const stillPath = path.join(fsTempRoot, 'still.jpg');
    await fs.writeFile(stillPath, Buffer.from('still-data'), 'utf8');

    const baseFrame = await loadSampleFrame();
    const cloneHand = (hand: number[][]) => hand.map((point) => [...point]);
    const frames: TrainingFrame[] = [
      baseFrame,
      {
        landmarks: [
          cloneHand(baseFrame.landmarks[1] ?? []),
          cloneHand(baseFrame.landmarks[0] ?? []),
        ],
        handedness: ['Right', 'Left'],
      },
    ];

    const result = await uploadTrainingBundle(
      {
        label: 'HILFE',
        profileId: 'p-test-123',
        clipUri: `file://${clipPath}`,
        stillUri: `file://${stillPath}`,
        frames,
        capturedAt: '2024-05-28T12:03:11Z',
        source: 'app://mediapipe',
      },
      {
        endpointOverride: `${baseUrl}/api/v1/dgs/sample-bundles`,
        tokenOverride: 'bundle-token',
      },
    );

    expect(result.status).toBe('queued');
    expect(typeof result.id).toBe('string');

    const manifestRaw = await fs.readFile(manifestPath(), 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(Array.isArray(manifest.entries)).toBe(true);
    expect(manifest.entries).toHaveLength(1);
    const entry = manifest.entries[0];
    expect(entry.metadata).toMatchObject({
      label: 'HILFE',
      profileId: 'p-test-123',
      capturedAt: '2024-05-28T12:03:11Z',
      source: 'app://mediapipe',
      clipFilename: 'clip.webm',
      stillFilename: 'still.jpg',
    });
    expect(entry.frames[0].handedness).toEqual(['Left', 'Right']);
    expect(entry.frames[1].handedness).toEqual(['Left', 'Right']);
    expect(entry.frames[0].landmarks[0]).toEqual(baseFrame.landmarks[0][0]);
    expect(entry.frames[1].landmarks[0]).toEqual(baseFrame.landmarks[0][0]);
    expect(entry.files).toEqual(
      expect.arrayContaining(['metadata.json', 'landmarks.json', 'clip.webm', 'still.jpg']),
    );
  });

  it('creates a degraded bundle when the clip is missing', async () => {
    const stillPath = path.join(fsTempRoot, 'still2.jpg');
    await fs.writeFile(stillPath, Buffer.from('still-data-2'), 'utf8');

    const frames: TrainingFrame[] = [await loadSampleFrame()];

    const result = await uploadTrainingBundle(
      {
        label: 'HALLO',
        profileId: 'p-test-456',
        stillUri: `file://${stillPath}`,
        frames,
        capturedAt: '2024-05-29T09:22:00Z',
        source: 'app://mediapipe',
      },
      {
        endpointOverride: `${baseUrl}/api/v1/dgs/sample-bundles`,
        tokenOverride: 'bundle-token',
      },
    );

    expect(result.status).toBe('queued');

    const manifestRaw = await fs.readFile(manifestPath(), 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(Array.isArray(manifest.entries)).toBe(true);
    expect(manifest.entries).toHaveLength(1);
    const entry = manifest.entries[0];
    expect(entry.metadata).toMatchObject({
      label: 'HALLO',
      profileId: 'p-test-456',
      capturedAt: '2024-05-29T09:22:00Z',
      source: 'app://mediapipe',
      stillFilename: 'still.jpg',
    });
    expect(entry.metadata.clipFilename).toBeUndefined();
    expect(entry.files).toEqual(expect.arrayContaining(['metadata.json', 'landmarks.json', 'still.jpg']));
    expect(entry.files).not.toContain('clip.mp4');
  });
});
