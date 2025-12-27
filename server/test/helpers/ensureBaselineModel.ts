import { promises as fs } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import {
  DEFAULT_MLP_LAYER1_SIZE,
  DEFAULT_MLP_LAYER2_SIZE,
  DEFAULT_MLP_INPUT_SIZE,
} from '../../src/services/mlpModelArtifacts.js';
import {
  WINDOW_SIZE,
  INPUT_FEATURE_SIZE,
} from '../../training/config_constants.js';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveBaselinePath(): Promise<string> {
  const { BASELINE_MLP_MODEL_PATH } = await import('../../src/constants/modelPaths.js');
  return BASELINE_MLP_MODEL_PATH;
}

export async function ensureBaselineModelFixture(explicitPath?: string): Promise<void> {
  const baselinePath = explicitPath ?? (await resolveBaselinePath());
  if (await fileExists(baselinePath)) {
    return;
  }

  await fs.mkdir(path.dirname(baselinePath), { recursive: true });

  const script = `import numpy as np, os, sys, tempfile
dest = sys.argv[1]
labels = np.array(['baseline'], dtype='<U64')
counts = np.zeros((labels.shape[0],), dtype=np.float32)
layer1 = ${DEFAULT_MLP_LAYER1_SIZE}
layer2 = ${DEFAULT_MLP_LAYER2_SIZE}
input_size = ${DEFAULT_MLP_INPUT_SIZE}
w1 = np.zeros((layer1, input_size), dtype=np.float32)
b1 = np.zeros((layer1,), dtype=np.float32)
w2 = np.zeros((layer2, layer1), dtype=np.float32)
b2 = np.zeros((layer2,), dtype=np.float32)
w3 = np.zeros((labels.shape[0], layer2), dtype=np.float32)
b3 = np.zeros((labels.shape[0],), dtype=np.float32)
os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(dest) or '.', suffix='.tmp')
try:
    with os.fdopen(fd, 'wb') as fh:
        np.savez(fh, labels=labels, counts=counts, w1=w1, b1=b1, w2=w2, b2=b2, w3=w3, b3=b3, arch='mlp_3layer_window', window_size=${WINDOW_SIZE}, input_dim=input_size, feature_size=${INPUT_FEATURE_SIZE})
    os.replace(tmp, dest)
finally:
    if os.path.exists(tmp):
        os.remove(tmp)`;

  const result = spawnSync('python3', ['-c', script, baselinePath], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    const stdout = result.stdout?.toString() ?? '';
    throw new Error(`Failed to create baseline MLP fixture: ${stderr || stdout}`);
  }
}
