export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
export const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || 'demo-token';
export const CONFIDENCE_THRESHOLD = 0.7;
export const MODEL_VERSION_URL = `${API_URL}/model-version`;
export const ANALYTICS_ENDPOINT = `${API_URL}/analytics`;
export const ANALYTICS_TELEMETRY_ENDPOINT = `${API_URL}/telemetry`;

export const ENABLE_REMOTE_CLASSIFICATION =
  process.env.EXPO_PUBLIC_ENABLE_REMOTE_CLASSIFICATION !== 'false';
export const REMOTE_RETRY_MS = Number(
  process.env.EXPO_PUBLIC_REMOTE_RETRY_MS || 30_000,
);
export const REMOTE_TIMEOUT_MS = Number(
  process.env.EXPO_PUBLIC_REMOTE_TIMEOUT_MS || 400,
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
