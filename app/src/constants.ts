import { Paths } from 'expo-file-system';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
export const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || 'demo-token';
export const CONFIDENCE_THRESHOLD = 0.7;
// Amy First: Lower thresholds for imperfect gestures (22q11 syndrome)
export const MLP_CONFIDENCE_THRESHOLD = 0.15;
// Lower bound for rule-based gesture fallback when MLP confidence is low
export const FALLBACK_CONFIDENCE_THRESHOLD = 0.3;
export const ANALYTICS_ENDPOINT = `${API_URL}/analytics`;
export const ANALYTICS_TELEMETRY_ENDPOINT = `${API_URL}/telemetry`;
export const CAMERA_WEBVIEW_BASE_URL = 'https://camera.local';

export const ENABLE_REMOTE_CLASSIFICATION =
  process.env.EXPO_PUBLIC_ENABLE_REMOTE_CLASSIFICATION !== 'false';
export const REMOTE_RETRY_MS = Number(
  process.env.EXPO_PUBLIC_REMOTE_RETRY_MS || 30_000,
);
export const REMOTE_TIMEOUT_MS = Number(
  process.env.EXPO_PUBLIC_REMOTE_TIMEOUT_MS || 400,
);

export const SOFTMAX_TEMPERATURE = Number(
  process.env.EXPO_PUBLIC_SOFTMAX_TEMPERATURE || 1.0,
);

// Enable landmark normalization before classification (wrist-center, scale)
export const NORMALIZE_LANDMARKS =
  process.env.EXPO_PUBLIC_NORMALIZE_LANDMARKS !== 'false';
// Optionally align rotation (in-plane) based on wrist→middle MCP vector
export const NORMALIZE_ALIGN_ROTATION =
  process.env.EXPO_PUBLIC_NORMALIZE_ALIGN_ROTATION === 'true';

export const LOG_LEVEL =
  (process.env.EXPO_PUBLIC_LOG_LEVEL ||
    (process.env.NODE_ENV === 'development' ? 'debug' : 'info')) as
    | 'debug'
    | 'info'
    | 'warn'
    | 'error';
const BASE_DIR = Paths.document.uri ?? Paths.cache.uri;
if (!BASE_DIR) {
  // Fail fast to surface misconfiguration early
  throw new Error('No writable FileSystem directory available');
}
export const CUSTOM_GESTURE_MODEL_PATH = `${BASE_DIR}custom_model.json`;
