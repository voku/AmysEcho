import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import express from 'express';
import request from 'supertest';
import type { Express } from 'express';
import { AuthService } from '../src/services/authService.js';

import { ensureBaselineModelFixture } from './helpers/ensureBaselineModel.js';

function binaryParser(res: any, callback: (err: Error | null, data?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => callback(err));
}

type ParsedNpy = { dtype: string; shape: number[] };

function parseNpyHeader(buf: Buffer): ParsedNpy {
  const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  if (view.getUint8(0) !== 0x93) {
    throw new Error('Invalid NPY magic');
  }
  const major = view.getUint8(6);
  const headerLen = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const headerStart = major === 1 ? 10 : 12;
  const headerSlice = uint8.subarray(headerStart, headerStart + headerLen);
  const header = Buffer.from(headerSlice).toString('latin1');
  const dtypeMatch = header.match(/'descr':\s*'([^']+)'/);
  const shapeMatch = header.match(/'shape':\s*\(([^\)]*)\)/);
  if (!dtypeMatch || !shapeMatch) {
    throw new Error('Invalid NPY header');
  }
  const dtype = dtypeMatch[1];
  const shapeParts = shapeMatch[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value));
  const shape = shapeParts.length > 0 ? shapeParts : [1];
  return { dtype, shape };
}

describe('GET /latest-mlp-model', () => {
  let dataDir: string;
  let app: Express;
  let originalDataDir: string | undefined;
  let modelPaths: typeof import('../src/constants/modelPaths.js');
  let baselinePath: string;
  let accessToken: string;
  async function expectValidModelResponse(response: request.Response) {
    const body: Buffer = response.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);

    const storedModelPath = modelPaths.getMlpModelPath();
    const storedStat = await fs.stat(storedModelPath);
    expect(storedStat.isFile()).toBe(true);

    const zip = new AdmZip(body);
    const entries = new Map(zip.getEntries().map((entry) => [entry.entryName, entry.getData()]));
    expect(entries.has('w1.npy')).toBe(true);
    expect(entries.has('b1.npy')).toBe(true);
    expect(entries.has('w2.npy')).toBe(true);
    expect(entries.has('b2.npy')).toBe(true);
    expect(entries.has('labels.npy')).toBe(true);
    expect(entries.has('counts.npy')).toBe(true);

    const w1 = parseNpyHeader(entries.get('w1.npy')!);
    expect(w1.shape.length).toBe(2);
    expect(w1.shape[0]).toBeGreaterThan(0);
    expect(w1.shape[1]).toBeGreaterThan(0);

    const b1 = parseNpyHeader(entries.get('b1.npy')!);
    expect(b1.shape.length).toBe(1);
    expect(b1.shape[0]).toBe(w1.shape[0]);

    const w2 = parseNpyHeader(entries.get('w2.npy')!);
    expect(w2.shape.length).toBe(2);
    expect(w2.shape[1]).toBe(w1.shape[0]);

    const b2 = parseNpyHeader(entries.get('b2.npy')!);
    expect(b2.shape.length).toBe(1);
    expect(b2.shape[0]).toBe(w2.shape[0]);

    const labels = parseNpyHeader(entries.get('labels.npy')!);
    expect(labels.dtype.includes('U')).toBe(true);
    expect(labels.shape.length).toBe(1);

    expect(response.headers['etag']).toMatch(/^"sha256-[a-f0-9]{64}"$/);
    expect(response.headers['x-checksum-sha256']).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof response.headers['x-model-version']).toBe('string');
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(response.headers['cdn-cache-control']).toBe('max-age=3600');
    expect(response.headers['x-resolved-path']).toBe(storedModelPath);
    expect(response.headers['x-model-source']).toBe('global');
    expect(response.headers['x-model-profile']).toBeUndefined();
  }

  beforeAll(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-mlp-endpoint-'));
    originalDataDir = process.env.AMY_ECHO_DATA_DIR;
    process.env.AMY_ECHO_DATA_DIR = dataDir;
    jest.resetModules();

    accessToken = AuthService.generateTokens({
      id: 'mlp-tester',
      username: 'mlp-tester',
      role: 'caregiver',
    }).accessToken;

    const [
      { createLatestMlpModelHandler },
      modelPathsModule,
      artifacts,
      authUtils,
      { auth: authMiddleware },
    ] = await Promise.all([
      import('../src/routes/latestMlpModelRoute.js'),
      import('../src/constants/modelPaths.js'),
      import('../src/services/mlpModelArtifacts.js'),
      import('../src/utils/profileAuthorization.js'),
      import('../src/middleware/auth.js'),
    ]);

    modelPaths = modelPathsModule;
    baselinePath = modelPaths.BASELINE_MLP_MODEL_PATH;
    await ensureBaselineModelFixture(baselinePath);

    const logTraining = async () => {};

    app = express();

    const handler = createLatestMlpModelHandler({
      getMlpModelPath: modelPaths.getMlpModelPath,
      seedBaselineModel: artifacts.seedBaselineModel,
      sendBinaryModel: artifacts.sendBinaryModel,
      applyModelHeaders: artifacts.applyModelResponseHeaders,
      logTraining,
      isProfileAuthorized: authUtils.isProfileAuthorized,
    });

    app.get('/latest-mlp-model', authMiddleware, handler);
    app.get('/api/v1/dgs/mlp-model', authMiddleware, handler);
  });

  beforeEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.mkdir(dataDir, { recursive: true });
    await ensureBaselineModelFixture(baselinePath);
  });

  afterAll(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    if (originalDataDir) {
      process.env.AMY_ECHO_DATA_DIR = originalDataDir;
    } else {
      delete process.env.AMY_ECHO_DATA_DIR;
    }
  });

  it('seeds a baseline model when none exists and returns a valid NPZ bundle', async () => {
    const response = await request(app)
      .get('/latest-mlp-model')
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    await expectValidModelResponse(response);
  });

  it('returns 304 for matching If-None-Match after a model upload', async () => {
    const storedModelPath = modelPaths.getMlpModelPath();
    await fs.mkdir(path.dirname(storedModelPath), { recursive: true });
    await fs.copyFile(modelPaths.BASELINE_MLP_MODEL_PATH, storedModelPath);

    const firstResponse = await request(app)
      .get('/latest-mlp-model')
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    const etag = firstResponse.headers['etag'];
    expect(typeof etag).toBe('string');

    const secondResponse = await request(app)
      .get('/latest-mlp-model')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('If-None-Match', etag as string)
      .expect(304);

    expect(secondResponse.text ?? '').toBe('');
    expect(secondResponse.headers['etag']).toBe(etag);
    expect(secondResponse.headers['x-checksum-sha256']).toBe(firstResponse.headers['x-checksum-sha256']);
    expect(secondResponse.headers['cache-control']).toBe(firstResponse.headers['cache-control']);
    expect(secondResponse.headers['cdn-cache-control']).toBe(firstResponse.headers['cdn-cache-control']);
  });

  it('returns 404 when baseline seeding fails', async () => {
    const copySpy = jest.spyOn(fs, 'copyFile').mockRejectedValue(new Error('missing baseline'));
    try {
      const response = await request(app)
        .get('/latest-mlp-model')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body).toEqual({ error: 'Model not found' });
      await expect(fs.stat(modelPaths.getMlpModelPath())).rejects.toHaveProperty('code', 'ENOENT');
    } finally {
      copySpy.mockRestore();
    }
  });

  it('returns 404 when the baseline artifact is absent in non-strict mode', async () => {
    await fs.rm(modelPaths.BASELINE_MLP_MODEL_PATH, { force: true });

    const response = await request(app)
      .get('/latest-mlp-model')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body).toEqual({ error: 'Model not found' });
  });

  it('serves the same NPZ payload from the legacy /api/v1/dgs/mlp-model endpoint', async () => {
    const response = await request(app)
      .get('/api/v1/dgs/mlp-model')
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    await expectValidModelResponse(response);
  });

  it('returns 404 from the legacy endpoint when baseline seeding fails', async () => {
    const copySpy = jest.spyOn(fs, 'copyFile').mockRejectedValue(new Error('missing baseline'));
    try {
      const response = await request(app)
        .get('/api/v1/dgs/mlp-model')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body).toEqual({ error: 'Model not found' });
      await expect(fs.stat(modelPaths.getMlpModelPath())).rejects.toHaveProperty('code', 'ENOENT');
    } finally {
      copySpy.mockRestore();
    }
  });

  it('requires matching X-Profile-Id for profiled requests', async () => {
    const profileModelPath = modelPaths.getMlpModelPath('p1');
    await fs.mkdir(path.dirname(profileModelPath), { recursive: true });
    await fs.copyFile(modelPaths.BASELINE_MLP_MODEL_PATH, profileModelPath);

    await request(app)
      .get('/latest-mlp-model?profileId=p1')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app)
      .get('/latest-mlp-model?profileId=p1')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Profile-Id', 'p1')
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('X-Model-Source', 'profile')
      .expect('X-Model-Profile', 'p1');
  });
});
