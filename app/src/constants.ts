export const API_TOKEN = process.env.OPENAI_API_KEY || '';
export const API_URL = 'https://api.amy.local'; // replaceable
export const CONFIDENCE_THRESHOLD = 0.7;
export const MODEL_VERSION_URL = `${API_URL}/model_version.json`;