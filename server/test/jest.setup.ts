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

process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

const originalError = console.error;
if (process.env.TEST_LOGS_VERBOSE !== '1') {
  console.error = (...args: any[]) => {
    const msg = args[0];
    if (
      typeof msg === 'string' &&
      (msg.includes('Vision validation error') ||
        msg.includes('Failed to parse vision response') ||
        msg.includes('LLM suggestion error') ||
        msg.includes('Invalid landmarks.json in training bundle') ||
        msg.includes('Failed to extract training bundle payload') ||
        msg.includes('Error saving training bundle') ||
        msg.includes('Failed to load database, creating a new one.'))
    )
      return;
    originalError(...args);
  };
}

const originalWarn = console.warn;
if (process.env.TEST_LOGS_VERBOSE !== '1') {
  console.warn = (...args: any[]) => {
    const msg = args[0];
    if (typeof msg === 'string' && msg.includes('Cloud classification failed')) return;
    originalWarn(...args);
  };
}
