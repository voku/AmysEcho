import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../src/services/logger.js', () => {
  const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    logErrorWithContext: jest.fn(),
    setContext: jest.fn(),
    clearContext: jest.fn(),
    apiRequest: jest.fn(),
    databaseOperation: jest.fn(),
    gestureProcessing: jest.fn(),
    trainingOperation: jest.fn(),
    modelOperation: jest.fn(),
    recognitionResult: jest.fn(),
    performanceMetric: jest.fn(),
    requestStart: jest.fn(),
    requestEnd: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    logger: mockLogger,
  };
});

// Set required environment variables for tests
// SECURITY: These are test-only values and should never be used in production
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.BACKUP_SECRET ??= 'test-backup-secret-DO-NOT-USE-IN-PRODUCTION';
const originalDataDir = process.env.AMY_ECHO_DATA_DIR;
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amy-echo-tests-'));
process.env.AMY_ECHO_DATA_DIR = tempDataDir;

afterAll(async () => {
  try {
    await fs.promises.rm(tempDataDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to remove test data directory', error);
  }
  if (originalDataDir) {
    process.env.AMY_ECHO_DATA_DIR = originalDataDir;
  } else {
    delete process.env.AMY_ECHO_DATA_DIR;
  }
});

const originalError = console.error;
if (process.env.TEST_LOGS_VERBOSE !== '1') {
  console.error = (...args: unknown[]) => {
    const msg = args[0];
    if (
      typeof msg === 'string' &&
      (msg.includes('Vision validation error') ||
        msg.includes('Failed to parse vision response') ||
        msg.includes('LLM suggestion error') ||
        msg.includes('Invalid landmarks.json in training bundle') ||
        msg.includes('Failed to extract training bundle payload') ||
        msg.includes('Error saving training bundle') ||
        msg.includes('Failed to load database, creating a new one.') ||
        msg.includes('Failed to prepare early MLP model:'))
    )
      return;
    originalError(...args);
  };
}

const originalWarn = console.warn;
if (process.env.TEST_LOGS_VERBOSE !== '1') {
  console.warn = (...args: unknown[]) => {
    const msg = args[0];
    if (typeof msg === 'string') {
      if (
        msg.includes('Cloud classification failed') ||
        msg.includes('Failed to remove test data directory') ||
        msg.includes('[mediapipe-integration] Missing')
      ) {
        return;
      }
    }
    originalWarn(...args);
  };
}
