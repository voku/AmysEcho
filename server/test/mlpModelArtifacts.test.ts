import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

import { ensureBaselineModelFixture } from './helpers/ensureBaselineModel.js';

// NOTE: This suite mutates the shared baseline artifact on disk and assumes Jest runs test files serially.
// Do not convert these tests to use concurrent execution without isolating the filesystem effects.
describe('writeMinimalMlpModel', () => {
  let tmpDir: string;
  let originalDataDir: string | undefined;

  beforeAll(async () => {
    await ensureBaselineModelFixture();
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlp-artifacts-'));
    originalDataDir = process.env.AMY_ECHO_DATA_DIR;
    process.env.AMY_ECHO_DATA_DIR = tmpDir;
    jest.resetModules();
    const { BASELINE_MLP_MODEL_PATH } = await import('../src/constants/modelPaths.js');
    await ensureBaselineModelFixture(BASELINE_MLP_MODEL_PATH);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    if (originalDataDir) {
      process.env.AMY_ECHO_DATA_DIR = originalDataDir;
    } else {
      delete process.env.AMY_ECHO_DATA_DIR;
    }
    await ensureBaselineModelFixture();
    jest.resetModules();
  });

  it('copies the baseline bundle when no gesture counts exist', async () => {
    const [{ writeMinimalMlpModel }, modelPaths] = await Promise.all([
      import('../src/services/mlpModelArtifacts.js'),
      import('../src/constants/modelPaths.js'),
    ]);

    const destination = path.join(tmpDir, 'models', 'global', 'amy_model.npz');
    const logMessages: string[] = [];

    await writeMinimalMlpModel(destination, {}, async (message) => {
      logMessages.push(message);
    });

    const destStat = await fs.stat(destination);
    expect(destStat.isFile()).toBe(true);

    const baselineContents = await fs.readFile(modelPaths.BASELINE_MLP_MODEL_PATH);
    const copiedContents = await fs.readFile(destination);
    expect(Buffer.compare(baselineContents, copiedContents)).toBe(0);

    const script = [
      'import json, numpy as np, sys',
      "data = np.load(sys.argv[1])",
      "keys = sorted(data.files)",
      "shapes = {k: [int(x) for x in data[k].shape] for k in keys}",
      "print(json.dumps({'keys': keys, 'shapes': shapes}))",
    ].join('\n');
    const result = spawnSync('python3', ['-c', script, destination], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { keys: string[]; shapes: Record<string, number[]> };
    expect(parsed.keys).toEqual(['b1', 'b2', 'counts', 'labels', 'w1', 'w2']);
    expect(parsed.shapes['w1'][0]).toBeGreaterThan(0);
    expect(parsed.shapes['w1'][1]).toBeGreaterThan(0);
    expect(parsed.shapes['b1'][0]).toBe(parsed.shapes['w1'][0]);
    expect(parsed.shapes['w2'][1]).toBe(parsed.shapes['w1'][0]);
    expect(parsed.shapes['b2'][0]).toBe(parsed.shapes['w2'][0]);

    expect(logMessages.some((message) => message.includes('seeded MLP from baseline'))).toBe(true);
  });

  it('throws when the baseline bundle cannot be copied for empty datasets', async () => {
    const { writeMinimalMlpModel } = await import('../src/services/mlpModelArtifacts.js');

    const destination = path.join(tmpDir, 'models', 'global', 'amy_model.npz');
    const copySpy = jest.spyOn(fs, 'copyFile').mockRejectedValue(new Error('missing baseline file'));

    try {
      await expect(writeMinimalMlpModel(destination, {}, async () => {})).rejects.toThrow(
        'Failed to seed baseline MLP model',
      );
      await expect(fs.stat(destination)).rejects.toHaveProperty('code', 'ENOENT');
    } finally {
      copySpy.mockRestore();
    }
  });

  it('generates a neutral NPZ with default labels when the baseline bundle is missing', async () => {
    const [{ writeMinimalMlpModel, DEFAULT_BASELINE_LABELS }, modelPaths] = await Promise.all([
      import('../src/services/mlpModelArtifacts.js'),
      import('../src/constants/modelPaths.js'),
    ]);

    const destination = path.join(tmpDir, 'models', 'global', 'amy_model.npz');
    await fs.rm(modelPaths.BASELINE_MLP_MODEL_PATH, { force: true });

    const logMessages: string[] = [];
    await writeMinimalMlpModel(destination, {}, async (message) => {
      logMessages.push(message);
    });

    const destStat = await fs.stat(destination);
    expect(destStat.isFile()).toBe(true);

    const script = [
      'import json, numpy as np, sys',
      "data = np.load(sys.argv[1])",
      "labels = data['labels'].tolist()",
      "counts = data['counts'].astype(float).tolist()",
      "keys = sorted(data.files)",
      "shapes = {k: [int(x) for x in data[k].shape] for k in keys}",
      "print(json.dumps({'labels': labels, 'counts': counts, 'shapes': shapes, 'countsDtype': str(data['counts'].dtype), 'w1Dtype': str(data['w1'].dtype)}))",
    ].join('\n');
    const result = spawnSync('python3', ['-c', script, destination], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      labels: string[];
      counts: number[];
      shapes: Record<string, number[]>;
      countsDtype: string;
      w1Dtype: string;
    };
    expect(parsed.labels).toEqual(DEFAULT_BASELINE_LABELS);
    expect(parsed.counts).toEqual(DEFAULT_BASELINE_LABELS.map(() => 0));
    if (process.platform !== 'win32') {
      expect((destStat.mode & 0o777)).toBe(0o640);
    }
    expect(parsed.shapes['w1'][0]).toBeGreaterThan(0);
    expect(parsed.shapes['w1'][1]).toBeGreaterThan(0);
    expect(parsed.shapes['w2'][0]).toBeGreaterThan(0);
    expect(parsed.shapes['w2'][1]).toEqual(parsed.shapes['w1'][0]);
    expect(parsed.countsDtype).toBe('float32');
    expect(parsed.w1Dtype).toBe('float32');

    expect(logMessages.some((message) => message.includes('Baseline-MLP fehlt'))).toBe(true);
    expect(logMessages.some((message) => message.includes('Neutraler MLP-Fallback'))).toBe(true);
  });
});
