import path from 'path';
import { SERVER_DIR, SRC_DIR } from '../constants/modelPaths.js';

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  apiLimit: number;
  modelMetadataLimit: number;
  mlpScript: string;
  trainingTimeoutMs: number;
  trainingSlaMs: number;
  backupSecret: string;
  trainScript: string;
  dbPath: string;
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
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  apiLimit: getEnvVarAsNumber('API_LIMIT', 120),
  modelMetadataLimit: getEnvVarAsNumber('MODEL_METADATA_LIMIT', 10),
  mlpScript: getEnvVar('MLP_SCRIPT', path.join(SRC_DIR, 'amyserver_tools', 'train_mlp.py')),
  trainingTimeoutMs: getEnvVarAsNumber('TRAINING_JOB_TIMEOUT_MS', 600_000),
  trainingSlaMs: getEnvVarAsNumber('TRAINING_JOB_SLA_MS', 120_000),
  backupSecret: getEnvVar('BACKUP_SECRET', 'default-secret-password'),
  trainScript: getEnvVar('TRAIN_SCRIPT', path.join(SRC_DIR, 'amyserver_tools', 'train_mlp.py')),
  dbPath: getEnvVar('DB_PATH', path.join(SERVER_DIR, 'db.json')),
  cloudApiUrl: getEnvVar('CLOUD_API_URL', 'http://localhost:4000/classify'),
  offlineModelPath: getEnvVar('OFFLINE_MODEL_PATH', path.join(SRC_DIR, 'offlineModel.json')),
  gestureTaskUrl: getEnvVar('GESTURE_TASK_URL', 'https://api.github.com/repos/sst/dgs/contents/tasks'),
  jwtSecret: getEnvVar('JWT_SECRET'),
  jwtRefreshSecret: getEnvVar('JWT_REFRESH_SECRET'),
};

export default config;
