export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';
export const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || 'demo-token';
export const CONFIDENCE_THRESHOLD = 0.7;
export const MODEL_VERSION_URL = `${API_URL}/model-version`;