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

const originalError = console.error;
if (process.env.TEST_LOGS_VERBOSE !== '1') {
  console.error = (...args: any[]) => {
    const msg = args[0];
    if (typeof msg === 'string' && (
      msg.includes('OpenAI Vision validation error') ||
      msg.includes('Failed to parse vision response') ||
      msg.includes('LLM suggestion error')
    )) return;
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
