import path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import type { Response } from 'express';
import {
  BASELINE_MLP_MODEL_PATH,
  SRC_DIR,
  MLP_MODELS_DIR,
} from '../constants/modelPaths.js';

const DEFAULT_MLP_INPUT_SIZE = 126;
const DEFAULT_MLP_HIDDEN_SIZE = 256;
const DEFAULT_BASELINE_LABELS = Object.freeze([
  'alle',
  'blau',
  'essen',
  'fertig',
  'gelb',
  'gruen',
  'nochmal',
  'rot',
  'satt',
  'schwester',
  'spielen',
  'trinken',
]);

export type BaselineSeedMessages = {
  success: (dest: string) => string;
  failure: (dest: string, error: unknown) => string;
};

const SERVER_MODULE_DIR = SRC_DIR;
const CDN_CACHE_MAX_AGE_SECONDS = 3600; // 1 hour

export async function seedBaselineModel(
  filePath: string,
  messages: BaselineSeedMessages,
  logTraining: (message: string) => Promise<void>,
): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.copyFile(BASELINE_MLP_MODEL_PATH, filePath);
    await fs.chmod(filePath, 0o640);
    await logTraining(messages.success(filePath));
    return true;
  } catch (error) {
    await logTraining(messages.failure(filePath, error));
    return false;
  }
}

export async function writeMinimalMlpModel(
  filePath: string,
  gestureCounts: Record<string, number>,
  logTraining: (message: string) => Promise<void>,
): Promise<void> {
  const entries = Object.entries(gestureCounts).map(([label, count]) => [label, Number(count) || 0] as const);
  const hasCounts = entries.some(([, count]) => count > 0);

  if (!hasCounts) {
    const seeded = await seedBaselineModel(filePath, {
      success: (dest) => `seeded MLP from baseline into ${dest}`,
      failure: (dest, error) => `failed to copy baseline MLP into ${dest}: ${String(error)}`,
    }, logTraining);
    if (!seeded) {
      throw new Error(
        `Failed to seed baseline MLP model at ${filePath}. Add server/data/models/global/amy_model.npz using a non-Codex assistant or reviewer.`,
      );
    }
    return;
  }

  const entryLabels = entries.map(([label]) => label);
  const entryCounts = entries.map(([, count]) => count);
  const labels = entryLabels.length > 0 ? entryLabels : [...DEFAULT_BASELINE_LABELS];
  const counts = entryLabels.length > 0 ? entryCounts : labels.map(() => 0);
  const payload = JSON.stringify({
    labels,
    counts,
    inputSize: DEFAULT_MLP_INPUT_SIZE,
    hiddenSize: DEFAULT_MLP_HIDDEN_SIZE,
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const script = `import json, numpy as np, os, sys\n` +
    `path = sys.argv[1]\n` +
    `payload = json.loads(sys.argv[2])\n` +
    `labels = payload.get('labels', [])\n` +
    `if not isinstance(labels, list):\n` +
    `    labels = []\n` +
    `counts = payload.get('counts', [])\n` +
    `if not isinstance(counts, list) or len(counts) != len(labels):\n` +
    `    counts = [0.0 for _ in labels]\n` +
    `labels_arr = np.array(labels, dtype='<U64')\n` +
    `counts_arr = np.array(counts, dtype=np.float32)\n` +
    `input_size = int(payload.get('inputSize', ${DEFAULT_MLP_INPUT_SIZE}))\n` +
    `hidden_size = int(payload.get('hiddenSize', ${DEFAULT_MLP_HIDDEN_SIZE}))\n` +
    `output_size = max(len(labels_arr), 1)\n` +
    `dtype = np.float32\n` +
    `w1 = np.zeros((hidden_size, input_size), dtype=dtype)\n` +
    `b1 = np.zeros((hidden_size,), dtype=dtype)\n` +
    `w2 = np.zeros((output_size, hidden_size), dtype=dtype)\n` +
    `b2 = np.zeros((output_size,), dtype=dtype)\n` +
    `tmp = path + '.tmp'\n` +
    `os.makedirs(os.path.dirname(path) or '.', exist_ok=True)\n` +
    `with open(tmp, 'wb') as f:\n` +
    `    np.savez(f, labels=labels_arr, counts=counts_arr, w1=w1, b1=b1, w2=w2, b2=b2)\n` +
    `os.replace(tmp, path)\n`;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('python3', ['-c', script, filePath, payload], {
      cwd: path.join(SERVER_MODULE_DIR, '..'),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `python exited with ${code}`));
      }
    });
  });

  await logTraining(`wrote minimal MLP model to ${filePath} (${labels.length} labels)`);

  try {
    await fs.chmod(filePath, 0o640);
  } catch {}
}

export async function sendBinaryModel(
  res: Response,
  filePath: string,
  downloadName: string,
): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    const buf = await fs.readFile(filePath);
    const sha256 = createHash('sha256').update(buf).digest('hex');

    const range = (res.req.headers['range'] as string | undefined) || undefined;
    res.setHeader('Accept-Ranges', 'bytes');
    const modelsDirResolved = path.resolve(MLP_MODELS_DIR);
    const relDir = path.relative(modelsDirResolved, path.dirname(filePath));
    const firstSegment = relDir.split(path.sep)[0];
    const isProfileSpecific =
      !!firstSegment && firstSegment !== 'global' && firstSegment !== '.';
    if (isProfileSpecific) {
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader('CDN-Cache-Control', `max-age=${CDN_CACHE_MAX_AGE_SECONDS}`);
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Resolved-Path', filePath);
    res.setHeader('ETag', `"sha256-${sha256}"`);
    res.setHeader('X-Checksum-SHA256', sha256);
    res.setHeader('X-Model-Version', String(Math.floor(stat.mtimeMs)));
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    if (range && range.startsWith('bytes=')) {
      const [startStr, endStr] = range.replace('bytes=', '').split('-');
      let start = parseInt(startStr, 10);
      let end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
      if (start > end || start < 0) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(chunkSize));
      const stream = fsSync.createReadStream(filePath, { start, end });
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(stat.size));
    res.send(buf);
  } catch {
    res.status(404).json({ error: 'Model not found' });
  }
}
