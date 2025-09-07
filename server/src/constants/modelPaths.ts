import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

// Resolve paths based on working directory. Integration and runtime start from server/.
export const SERVER_DIR = path.resolve(process.cwd());
export const DATA_DIR = path.join(SERVER_DIR, 'data');

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
export const GESTURE_LABELS_PATH = path.join(
  SERVER_DIR,
  '../app/assets/models/gesture_labels.json',
);

// Ensure DATA_DIR exists before any read/write
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
