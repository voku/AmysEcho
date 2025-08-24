import path from 'path';
import { promises as fs } from 'fs';

// Resolve paths relative to the compiled server directory to avoid CWD issues
// __dirname is .../dist/constants after build, so go two levels up to reach repo's server dir
export const SERVER_DIR = path.join(__dirname, '..', '..');
export const DATA_DIR = path.join(SERVER_DIR, 'data');

export const HAND_LANDMARKER_MODEL_PATH = path.join(__dirname, '../../../app/assets/models/hand_landmarker.tflite');
export const GESTURE_CLASSIFIER_MODEL_PATH = path.join(__dirname, '../../../app/assets/models/gesture_classifier.tflite');
// New centroid-based model path (JSON), replacing old TFLite artifact
export const TRAINED_MODEL_PATH = path.join(DATA_DIR, 'trained_model.json');
export const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export function getTrainedModelPath(profileId?: string): string {
  if (profileId) {
    if (!PROFILE_ID_PATTERN.test(profileId)) {
      throw new Error('Invalid profileId');
    }
    return path.join(DATA_DIR, `trained_model_${profileId}.json`);
  }
  return TRAINED_MODEL_PATH;
}
export const GESTURE_LABELS_PATH = path.join(__dirname, '../../../app/assets/models/gesture_labels.json');
export const MODEL_VERSIONS_PATH = path.join(__dirname, '../../../app/assets/models/versions.json');

// Ensure DATA_DIR exists before any read/write
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
