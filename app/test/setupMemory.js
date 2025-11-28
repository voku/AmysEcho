// Memory optimization setup for Jest tests
// This helps prevent memory leaks during large test runs

// Force garbage collection if available (only in Node.js with --expose-gc)
if (global.gc) {
  // Run GC before each test suite to clean up memory
  beforeAll(() => {
    global.gc();
  });

  // Run GC after each test to prevent memory accumulation
  afterEach(() => {
    global.gc();
  });
}

// Increase timeout for memory-intensive operations
jest.setTimeout(30000);

// Mock heavy dependencies that might cause memory issues
jest.mock('react-native/Libraries/Image/Image', () => ({
  getSize: jest.fn(() => Promise.resolve({ width: 100, height: 100 })),
}));

// Mock WebView to prevent memory issues
jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
  default: 'WebView',
}));

// Clean up after each test
afterEach(() => {
  // Clear any remaining timers
  jest.clearAllTimers();

  // Clear all mocks
  jest.clearAllMocks();

  // Force cleanup of any cached modules
  if (jest.resetModules) {
    jest.resetModules();
  }
});