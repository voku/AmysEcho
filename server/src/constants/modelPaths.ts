import path from 'path';

// Resolve paths relative to the compiled server directory to avoid CWD issues
// __dirname is .../dist/constants after build, so go two levels up to reach repo's server dir
export const SERVER_DIR = path.join(__dirname, '..', '..');
export const DATA_DIR = path.join(SERVER_DIR, 'data');

export const HAND_LANDMARKER_MODEL_PATH = path.join(__dirname, '../../../app/assets/models/hand_landmarker.tflite');
export const GESTURE_CLASSIFIER_MODEL_PATH = path.join(__dirname, '../../../app/assets/models/gesture_classifier.tflite');
// New centroid-based model path (JSON), replacing old TFLite artifact
export const TRAINED_MODEL_PATH = path.join(DATA_DIR, 'trained_model.json');
export const GESTURE_LABELS_PATH = path.join(__dirname, '../../../app/assets/models/gesture_labels.json');
export const MODEL_VERSIONS_PATH = path.join(__dirname, '../../../app/assets/models/versions.json');
