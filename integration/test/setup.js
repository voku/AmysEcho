/**
 * Integration Test Setup
 */

import { beforeAll, afterAll, afterEach } from '@jest/globals';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:5000';
process.env.EXPO_PUBLIC_API_TOKEN = 'test-token';

// Mock console methods to reduce noise during tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = (...args) => {
    if (args[0]?.includes?.('Warning: ReactDOM.render is no longer supported')) return;
    if (args[0]?.includes?.('Warning: ReactDOMTestUtils')) return;
    originalConsoleError(...args);
  };

  console.warn = (...args) => {
    if (args[0]?.includes?.('Warning:')) return;
    originalConsoleWarn(...args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios || obj.default,
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 667 })),
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten: jest.fn((style) => style),
  },
  PixelRatio: {
    get: jest.fn(() => 2),
  },
}), { virtual: true });

// Mock Expo modules
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///test/',
  cacheDirectory: 'file:///test/cache/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));

// Mock fetch globally
global.fetch = jest.fn();

// Mock timers
jest.useFakeTimers();

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});
