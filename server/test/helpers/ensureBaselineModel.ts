import { promises as fs } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { BASELINE_MLP_MODEL_PATH } from '../../src/constants/modelPaths.js';
import {
  DEFAULT_MLP_HIDDEN_SIZE,
  DEFAULT_MLP_INPUT_SIZE,
} from '../../src/services/mlpModelArtifacts.js';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function ensureBaselineModelFixture(): Promise<void> {
  if (await fileExists(BASELINE_MLP_MODEL_PATH)) {
    return;
  }

  await fs.mkdir(path.dirname(BASELINE_MLP_MODEL_PATH), { recursive: true });

  const script = `import numpy as np, os, sys
dest = sys.argv[1]
labels = np.array(['baseline'], dtype='<U64')
counts = np.zeros((labels.shape[0],), dtype=np.float32)
hidden = ${DEFAULT_MLP_HIDDEN_SIZE}
input_size = ${DEFAULT_MLP_INPUT_SIZE}
w1 = np.zeros((hidden, input_size), dtype=np.float32)
b1 = np.zeros((hidden,), dtype=np.float32)
w2 = np.zeros((labels.shape[0], hidden), dtype=np.float32)
b2 = np.zeros((labels.shape[0],), dtype=np.float32)
tmp = dest + '.tmp'
os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
with open(tmp, 'wb') as fh:
    np.savez(fh, labels=labels, counts=counts, w1=w1, b1=b1, w2=w2, b2=b2)
os.replace(tmp, dest)`;

  const result = spawnSync('python3', ['-c', script, BASELINE_MLP_MODEL_PATH], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    const stdout = result.stdout?.toString() ?? '';
    throw new Error(`Failed to create baseline MLP fixture: ${stderr || stdout}`);
  }
}
