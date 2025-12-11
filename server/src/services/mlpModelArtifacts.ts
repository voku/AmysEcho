import path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import type { Stats } from 'fs';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import type { Response } from 'express';
import {
  BASELINE_MLP_MODEL_PATH,
  SRC_DIR,
  MLP_MODELS_DIR,
  SERVER_DIR,
} from '../constants/modelPaths.js';

export const DEFAULT_MLP_INPUT_SIZE = 126;
export const DEFAULT_MLP_HIDDEN_SIZE = 256;
const FALLBACK_BASELINE_LABELS = [
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
] as const;

function loadDefaultBaselineLabels(): readonly string[] {
  const defaultPath = path.join(SERVER_DIR, 'data', 'config', 'defaultBaselineLabels.json');
  try {
    const raw = fsSync.readFileSync(defaultPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (parsed.every((item) => typeof item === 'string')) {
        return Object.freeze(parsed.map((label) => String(label)));
      }
      // eslint-disable-next-line no-console -- fallback logging for configuration loading issues
      console.warn(
        `Invalid structure in ${defaultPath}; expected array of strings. Falling back to hard-coded values.`,
      );
    }
  } catch (error) {
    // ignore and fall back to hard-coded defaults
    // eslint-disable-next-line no-console -- fallback logging for configuration loading issues
    console.warn(
      `Failed to load default baseline labels from ${defaultPath}; falling back to hard-coded values.`,
      error,
    );
  }
  return Object.freeze([...FALLBACK_BASELINE_LABELS]);
}

export const DEFAULT_BASELINE_LABELS = loadDefaultBaselineLabels();

export type BaselineSeedMessages = {
  success: (dest: string) => string;
  failure: (dest: string, error: unknown) => string;
};

const SERVER_MODULE_DIR = SRC_DIR;
// Ensure bundlers include the helper script by referencing it relative to the source tree.
const ZERO_MODEL_SCRIPT_PATH = path.join(SERVER_MODULE_DIR, 'amyserver_tools', 'generate_zero_model.py');
const CDN_CACHE_MAX_AGE_SECONDS = 3600; // 1 hour
const REQUIRE_BASELINE_ARTIFACT = ['1', 'true', 'yes'].includes(
  (process.env.MLP_REQUIRE_BASELINE ?? (process.env.NODE_ENV === 'production' ? '1' : '0')).toLowerCase(),
);
const EXPECTED_BASELINE_SHA = (process.env.MLP_BASELINE_SHA256 ?? '').toLowerCase();

async function assertBaselineIntegrity(): Promise<void> {
  const buffer = await fs.readFile(BASELINE_MLP_MODEL_PATH);
  if (!EXPECTED_BASELINE_SHA) {
    return;
  }
  const sha = createHash('sha256').update(buffer).digest('hex');
  if (sha.toLowerCase() !== EXPECTED_BASELINE_SHA) {
    throw new Error(
      `Baseline-MLP SHA256 stimmt nicht: erwartet ${EXPECTED_BASELINE_SHA}, erhalten ${sha}`,
    );
  }
}

async function ensureBaselinePresent(): Promise<boolean> {
  const exists = await fs
    .stat(BASELINE_MLP_MODEL_PATH)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error?.code === 'ENOENT') {
        return false;
      }
      throw error;
    });

  if (!exists && REQUIRE_BASELINE_ARTIFACT) {
    throw new Error(
      `Baseline-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}. Stelle das geprüfte Artefakt bereit oder setze MLP_REQUIRE_BASELINE=0 für Entwicklungszwecke.`,
    );
  }

  if (exists) {
    await assertBaselineIntegrity();
  }

  return exists;
}

export async function seedBaselineModel(
  filePath: string,
  messages: BaselineSeedMessages,
  logTraining: (message: string) => Promise<void>,
): Promise<boolean> {
  try {
    const baselineAvailable = await ensureBaselinePresent();
    if (!baselineAvailable) {
      await logTraining(
        messages.failure(
          filePath,
          new Error(`Baseline-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}`),
        ),
      );
      return false;
    }
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
  logTraining?: (message: string) => Promise<void>,
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
    const proc = spawn('python3', [ZERO_MODEL_SCRIPT_PATH, filePath], {
      cwd: path.join(SERVER_MODULE_DIR, '..'),
      stdio: ['pipe', 'ignore', 'pipe'],
      env: { ...process.env },
    });
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.stdin.on('error', (error) => {
      reject(error);
    });
    proc.on('error', (error) => {
      reject(error);
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const trimmed = stderr.trim();
        if (trimmed && logTraining) {
          logTraining(`(Warnung) Python-Helfer meldete: ${trimmed}`).catch(() => {});
        }
        reject(new Error(trimmed || `python3 exited with ${code}`));
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
          `Failed to seed baseline MLP model at ${filePath}. Provide ${BASELINE_MLP_MODEL_PATH} via your deployment process.`,
        );
      }
      return;
    }

    if (REQUIRE_BASELINE_ARTIFACT) {
      throw new Error(
        `Baseline-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}. Stelle ein geprüftes Artefakt bereit, damit Trainingsjobs nicht mit neutralen Gewichten starten.`,
      );
    }

    await logTraining(
      `Baseline-MLP fehlt unter ${BASELINE_MLP_MODEL_PATH}; erstelle neutrales Modell in ${filePath} (Labels=${DEFAULT_BASELINE_LABELS.length})`,
    );
    const labelCount = await writeZeroInitializedModel(
      filePath,
      DEFAULT_BASELINE_LABELS,
      DEFAULT_BASELINE_LABELS.map(() => 0),
      logTraining,
    );
    await logTraining(`Neutraler MLP-Fallback nach ${filePath} geschrieben (${labelCount} Labels)`);
  } else {
    const entries = Object.entries(gestureCounts).map(([label, count]) => [label, Number(count) || 0] as const);
    const entryLabels = entries.map(([label]) => label);
    const entryCounts = entries.map(([, count]) => count);
    const labelCount = await writeZeroInitializedModel(filePath, entryLabels, entryCounts, logTraining);

    await logTraining(`wrote minimal MLP model to ${filePath} (${labelCount} labels)`);
  }

  try {
    await fs.chmod(filePath, 0o640);
  } catch (error) {
    await logTraining(`(Warnung) Konnte Rechte für ${filePath} nicht setzen: ${String(error)}`);
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
