export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
export const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || 'demo-token';
export const CONFIDENCE_THRESHOLD = 0.7;
export const MODEL_VERSION_URL = `${API_URL}/model-version`;
export const ANALYTICS_ENDPOINT = `${API_URL}/analytics`;

export const ENABLE_REMOTE_CLASSIFICATION =
  process.env.EXPO_PUBLIC_ENABLE_REMOTE_CLASSIFICATION !== 'false';
export const REMOTE_RETRY_MS = Number(
  process.env.EXPO_PUBLIC_REMOTE_RETRY_MS || 30_000,
);
export const REMOTE_TIMEOUT_MS = Number(
  process.env.EXPO_PUBLIC_REMOTE_TIMEOUT_MS || 400,
);

export const LOG_LEVEL =
  (process.env.EXPO_PUBLIC_LOG_LEVEL ||
    (process.env.NODE_ENV === 'development' ? 'debug' : 'info')) as
    | 'debug'
    | 'info'
    | 'warn'
    | 'error';
