import path from 'path';
import { promises as fs, existsSync } from 'fs';

const explicitDataDir = process.env.AMY_ECHO_DATA_DIR || process.env.AMY_DATA_DIR;

function resolveServerDir(): string {
  const candidates: (string | undefined)[] = [];

  if (typeof __dirname !== 'undefined') {
    candidates.push(path.resolve(__dirname, '..', '..'));
  }

  if (typeof process !== 'undefined') {
    const cwd = typeof process.cwd === 'function' ? process.cwd() : undefined;
    if (cwd) {
      candidates.push(path.resolve(cwd));
      candidates.push(path.resolve(cwd, 'server'));
    }

    if (Array.isArray(process.argv)) {
      const scriptPath = process.argv[1];
      if (scriptPath) {
        candidates.push(path.resolve(path.dirname(scriptPath), '..'));
      }
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  // Fall back to cwd so tests still have a deterministic location.
  return candidates.find(Boolean) ?? path.resolve('.');
}

export const SERVER_DIR = resolveServerDir();
export const SRC_DIR = path.join(SERVER_DIR, 'src');
export const DATA_DIR = explicitDataDir
  ? path.resolve(explicitDataDir)
  : path.join(SERVER_DIR, 'data');

// Centroid-based model path (JSON)
export const TRAINED_MODEL_PATH = path.join(DATA_DIR, 'trained_model.json');
export const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
function getProfiledPath(basePath: string, profileId?: string): string {
  if (profileId) {
    if (!PROFILE_ID_PATTERN.test(profileId)) {
      throw new Error('Invalid profileId');
    }
    const ext = path.extname(basePath);
    const base = path.basename(basePath, ext);
    return path.join(DATA_DIR, `${base}_${profileId}${ext}`);
  }
  return basePath;
}

export function getTrainedModelPath(profileId?: string): string {
  return getProfiledPath(TRAINED_MODEL_PATH, profileId);
}

// MLP model path (.npz)
export const MLP_MODELS_DIR = path.join(DATA_DIR, 'models');
export const TRAINED_MLP_GLOBAL_DIR = path.join(MLP_MODELS_DIR, 'global');
export const TRAINED_MLP_MODEL_PATH = path.join(TRAINED_MLP_GLOBAL_DIR, 'amy_model.npz');
export function getMlpModelPath(profileId?: string): string {
  if (!profileId) {
    return TRAINED_MLP_MODEL_PATH;
  }
  if (!PROFILE_ID_PATTERN.test(profileId)) {
    throw new Error('Invalid profileId');
  }
  return path.join(MLP_MODELS_DIR, profileId, 'amy_model.npz');
}
export const BASELINE_MLP_MODEL_PATH = path.join(SERVER_DIR, '..', 'data', 'amy_model.npz');
export const GESTURE_LABELS_PATH = path.join(
  SERVER_DIR,
  '../app/assets/models/gesture_labels.json',
);

export const TRAINING_UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const TRAINING_DATASETS_DIR = path.join(DATA_DIR, 'datasets');
export const TRAINING_MANIFEST_PATH = path.join(TRAINING_DATASETS_DIR, 'training_manifest.json');

// Ensure DATA_DIR exists before any read/write
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
