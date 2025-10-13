import path from 'path';
import { SERVER_DIR, SRC_DIR } from '../constants/modelPaths.js';

export interface ServerConfig {
  port: number;
  apiToken: string;
  nodeEnv: string;
  dialogLimit: number;
  apiLimit: number;
  mlpScript: string;
  backupSecret: string;
  trainScript: string;
  dbPath: string;
  openaiApiKey?: string;
  cloudApiUrl: string;
  offlineModelPath: string;
  gestureTaskUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value || defaultValue!;
}

function getEnvVarAsNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
}

export const config: ServerConfig = {
  port: getEnvVarAsNumber('PORT', 5000),
  apiToken: getEnvVar('API_TOKEN', 'default-test-token'),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  dialogLimit: getEnvVarAsNumber('DIALOG_LIMIT', 60),
  apiLimit: getEnvVarAsNumber('API_LIMIT', 120),
  mlpScript: getEnvVar('MLP_SCRIPT', path.join(SRC_DIR, 'amyserver_tools', 'train_mlp.py')),
  backupSecret: getEnvVar('BACKUP_SECRET', 'default-secret-password'),
  trainScript: getEnvVar('TRAIN_SCRIPT', path.join(SRC_DIR, 'amyserver_tools', 'train_mlp.py')),
  dbPath: getEnvVar('DB_PATH', path.join(SERVER_DIR, 'db.json')),
  openaiApiKey: process.env.OPENAI_API_KEY,
  cloudApiUrl: getEnvVar('CLOUD_API_URL', 'http://localhost:4000/classify'),
  offlineModelPath: getEnvVar('OFFLINE_MODEL_PATH', path.join(SRC_DIR, 'offlineModel.json')),
  gestureTaskUrl: getEnvVar('GESTURE_TASK_URL', 'https://api.github.com/repos/sst/dgs/contents/tasks'),
  jwtSecret: getEnvVar('JWT_SECRET', 'your-super-secret-jwt-key-change-in-production'),
  jwtRefreshSecret: getEnvVar('JWT_REFRESH_SECRET', 'your-super-secret-refresh-key-change-in-production'),
};

export default config;
