import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const explicitDataDir = process.env.AMY_ECHO_DATA_DIR || process.env.AMY_DATA_DIR;

// Derive server directory from this module location to avoid cwd surprises.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = path.resolve(moduleDir, '..', '..');
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
export const TRAINED_MLP_MODEL_PATH = path.join(DATA_DIR, 'dgs_model.npz');
export function getMlpModelPath(profileId?: string): string {
  return getProfiledPath(TRAINED_MLP_MODEL_PATH, profileId);
}
export const BASELINE_MLP_MODEL_PATH = path.join(SERVER_DIR, '..', 'data', 'dgs_model.npz');
export const GESTURE_LABELS_PATH = path.join(
  SERVER_DIR,
  '../app/assets/models/gesture_labels.json',
);

// Ensure DATA_DIR exists before any read/write
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
