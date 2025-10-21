import path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import type { Stats } from 'fs';
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import type { Response } from 'express';
import {
  BASELINE_MLP_MODEL_PATH,
  SRC_DIR,
  MLP_MODELS_DIR,
} from '../constants/modelPaths.js';
import { DEFAULT_BASELINE_LABELS } from '../constants/defaultBaselineLabels.js';

export const DEFAULT_MLP_INPUT_SIZE = 126;
export const DEFAULT_MLP_HIDDEN_SIZE = 256;
export { DEFAULT_BASELINE_LABELS };

export type BaselineSeedMessages = {
  success: (dest: string) => string;
  failure: (dest: string, error: unknown) => string;
};

const SERVER_MODULE_DIR = SRC_DIR;
// Ensure bundlers include the helper script by referencing it relative to the source tree.
const ZERO_MODEL_SCRIPT_PATH = path.join(SERVER_MODULE_DIR, 'amyserver_tools', 'generate_zero_model.py');
const PYTHON_CANDIDATES = [
  ...(process.env.PYTHON_CMD ? [process.env.PYTHON_CMD] : []),
  'python3',
  'python',
];
const RESOLVED_PYTHON_CMD = (() => {
  for (const candidate of PYTHON_CANDIDATES) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!result.error) {
      return candidate;
    }
  }
  throw new Error(
    'Unable to locate a Python interpreter. Set PYTHON_CMD or install python3 to enable minimal MLP generation.',
  );
})();
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

async function writeZeroInitializedModel(
  filePath: string,
  labels: readonly string[],
  counts: readonly number[],
): Promise<number> {
  const effectiveLabels = (labels.length > 0 ? labels : DEFAULT_BASELINE_LABELS).map((label) => String(label));
  const effectiveCounts = effectiveLabels.map((_, index) => {
    const value = Number(counts[index]) || 0;
    return value < 0 ? 0 : value;
  });
  const payload = JSON.stringify({
    labels: effectiveLabels,
    counts: effectiveCounts,
    inputSize: DEFAULT_MLP_INPUT_SIZE,
    hiddenSize: DEFAULT_MLP_HIDDEN_SIZE,
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(RESOLVED_PYTHON_CMD, [ZERO_MODEL_SCRIPT_PATH, filePath], {
      cwd: path.join(SERVER_MODULE_DIR, '..'),
      stdio: ['pipe', 'ignore', 'pipe'],
      env: { ...process.env },
    });
    const killer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (killError) {
        if (process.env.DEBUG_MLP_TRAINING) {
          // eslint-disable-next-line no-console -- debug-only logging when enabled
          console.debug('Failed to kill hung Python process:', killError);
        }
      }
    }, 15000);
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.stdin.on('error', (error) => {
      clearTimeout(killer);
      reject(error);
    });
    proc.on('error', (error) => {
      clearTimeout(killer);
      reject(error);
    });
    proc.on('close', (code) => {
      clearTimeout(killer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `python exited with ${code}`));
      }
    });
    proc.stdin.end(payload);
  });

  return effectiveLabels.length;
}

export async function writeMinimalMlpModel(
  filePath: string,
  gestureCounts: Record<string, number>,
  logTraining: (message: string) => Promise<void>,
): Promise<void> {
  const hasCounts = Object.values(gestureCounts).some((count) => (Number(count) || 0) > 0);

  if (!hasCounts) {
    const baselineExists = await fs
      .stat(BASELINE_MLP_MODEL_PATH)
      .then(() => true)
      .catch(() => false);
    if (baselineExists) {
      const seeded = await seedBaselineModel(filePath, {
        success: (dest) => `seeded MLP from baseline into ${dest}`,
        failure: (dest, error) => `failed to copy baseline MLP into ${dest}: ${String(error)}`,
      }, logTraining);
      if (!seeded) {
        throw new Error(
          `Failed to seed baseline MLP model at ${filePath}. Provide ${BASELINE_MLP_MODEL_PATH} via your deployment process or artifact store.`,
        );
      }
      return;
    }

    await logTraining(
      `baseline MLP missing at ${BASELINE_MLP_MODEL_PATH}; generating neutral weights in ${filePath} (source=neutral-fallback, labels=${DEFAULT_BASELINE_LABELS.length})`,
    );
    const labelCount = await writeZeroInitializedModel(filePath, DEFAULT_BASELINE_LABELS, DEFAULT_BASELINE_LABELS.map(() => 0));
    await logTraining(`wrote minimal MLP model to ${filePath} (source=neutral-fallback, labels=${labelCount})`);
  } else {
    const entries = Object.entries(gestureCounts).map(([label, count]) => [label, Number(count) || 0] as const);
    const entryLabels = entries.map(([label]) => label);
    const entryCounts = entries.map(([, count]) => count);
    const labelCount = await writeZeroInitializedModel(filePath, entryLabels, entryCounts);

    await logTraining(`wrote minimal MLP model to ${filePath} (${labelCount} labels)`);
  }

  try {
    await fs.chmod(filePath, 0o640);
  } catch (error) {
    await logTraining(`(Warning) Failed to set permissions on ${filePath}: ${String(error)}`);
  }
}

export type ModelResponseMetadata = {
  stat: Stats;
  sha256: string;
  etag: string;
};

export type PrecomputedModelPayload = ModelResponseMetadata & {
  buffer?: Buffer;
};

function buildModelResponseMetadata(stat: Stats, buffer: Buffer): PrecomputedModelPayload {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return {
    stat,
    sha256,
    etag: `"sha256-${sha256}"`,
    buffer,
  };
}

async function loadModelPayload(filePath: string): Promise<PrecomputedModelPayload> {
  const stat = await fs.stat(filePath);
  const buffer = await fs.readFile(filePath);
  return buildModelResponseMetadata(stat, buffer);
}

export function applyModelResponseHeaders(
  res: Response,
  filePath: string,
  downloadName: string,
  metadata: ModelResponseMetadata,
): void {
  res.setHeader('Accept-Ranges', 'bytes');
  const modelsDirResolved = path.resolve(MLP_MODELS_DIR);
  const relDir = path.relative(modelsDirResolved, path.dirname(filePath));
  const firstSegment = relDir.split(path.sep)[0];
  const isProfileSpecific = !!firstSegment && firstSegment !== 'global' && firstSegment !== '.';
  const profileId = isProfileSpecific ? firstSegment : null;
  if (isProfileSpecific) {
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.removeHeader('CDN-Cache-Control');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('CDN-Cache-Control', `max-age=${CDN_CACHE_MAX_AGE_SECONDS}`);
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Resolved-Path', filePath);
  res.setHeader('ETag', metadata.etag);
  res.setHeader('X-Checksum-SHA256', metadata.sha256);
  res.setHeader('X-Model-Version', String(Math.floor(metadata.stat.mtimeMs)));
  res.setHeader('X-Model-Source', profileId ? 'profile' : 'global');
  if (profileId) {
    res.setHeader('X-Model-Profile', profileId);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
}

type SendBinaryModelOptions = {
  precomputed?: PrecomputedModelPayload;
  headersOnly?: boolean;
};

export async function sendBinaryModel(
  res: Response,
  filePath: string,
  downloadName: string,
  options: SendBinaryModelOptions = {},
): Promise<void> {
  try {
    const range = (res.req.headers['range'] as string | undefined) || undefined;
    let buffer: Buffer | undefined = options.precomputed?.buffer;
    let metadata: ModelResponseMetadata;

    if (options.precomputed) {
      const { stat, sha256, etag } = options.precomputed;
      metadata = { stat, sha256, etag };
    } else {
      const loaded = await loadModelPayload(filePath);
      buffer = loaded.buffer;
      metadata = { stat: loaded.stat, sha256: loaded.sha256, etag: loaded.etag };
    }

    applyModelResponseHeaders(res, filePath, downloadName, metadata);

    if (options.headersOnly) {
      return;
    }

    if (range && range.startsWith('bytes=')) {
      const [startStr, endStr] = range.replace('bytes=', '').split('-');
      let start = parseInt(startStr, 10);
      let end = endStr ? parseInt(endStr, 10) : metadata.stat.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= metadata.stat.size) end = metadata.stat.size - 1;
      if (start > end || start < 0) {
        res.status(416).setHeader('Content-Range', `bytes */${metadata.stat.size}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${metadata.stat.size}`);
      res.setHeader('Content-Length', String(chunkSize));
      if (buffer) {
        res.send(buffer.subarray(start, end + 1));
      } else {
        const stream = fsSync.createReadStream(filePath, { start, end });
        stream.pipe(res);
      }
      return;
    }

    if (!buffer) {
      buffer = await fs.readFile(filePath);
    }

    res.setHeader('Content-Length', String(metadata.stat.size));
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'Model not found' });
  }
}
