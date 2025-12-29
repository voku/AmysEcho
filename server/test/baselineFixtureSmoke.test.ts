import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { spawnSync } from 'child_process';

import { ensureBaselineModelFixture } from './helpers/ensureBaselineModel.js';

describe('baseline fixture smoke test', () => {
  it('loads fixture in TypeScript and Python', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-baseline-fixture-'));
    const modelPath = path.join(tmpDir, 'models', 'global', 'amy_model.npz');

    try {
      await ensureBaselineModelFixture(modelPath);

      const buffer = await fs.readFile(modelPath);
      const zip = new AdmZip(buffer);
      const entries = new Set(zip.getEntries().map((entry) => entry.entryName));
      expect(entries.has('w1.npy')).toBe(true);
      expect(entries.has('b1.npy')).toBe(true);
      expect(entries.has('w2.npy')).toBe(true);
      expect(entries.has('b2.npy')).toBe(true);
      expect(entries.has('w3.npy')).toBe(true);
      expect(entries.has('b3.npy')).toBe(true);
      expect(entries.has('labels.npy')).toBe(true);
      expect(entries.has('counts.npy')).toBe(true);

      const script = [
        'import json, numpy as np, sys',
        "data = np.load(sys.argv[1])",
        "keys = sorted(data.files)",
        "labels = data['labels'].tolist()",
        "print(json.dumps({'keys': keys, 'labels': labels}))",
      ].join('\n');
      const result = spawnSync('python3', ['-c', script, modelPath], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as { keys: string[]; labels: string[] };
      expect(parsed.keys).toEqual(
        expect.arrayContaining(['arch', 'b1', 'b2', 'b3', 'counts', 'feature_size', 'input_dim', 'labels', 'w1', 'w2', 'w3', 'window_size']),
      );
      expect(parsed.labels.length).toBeGreaterThan(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }, 30000);
});
