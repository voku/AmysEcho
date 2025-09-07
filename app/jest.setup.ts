// Ensure React 19 act() warnings are silenced during tests
// by telling React that the test environment supports `act`.
// See https://react.dev/reference/react/act for details.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Suppress react-test-renderer deprecation warnings
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) {
    return;
  }
  originalConsoleError(...args);
};

// Provide a default global fetch so tests can spy/mock it reliably
if (!(global as any).fetch) {
  (global as any).fetch = jest.fn(async () => { throw new Error('network'); });
}


jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
}));
jest.mock('./db', () => ({ database: { get: jest.fn(), write: jest.fn() } }));
jest.mock('./db/models', () => ({}));
// Note: NetInfo is mocked per-test where needed to avoid shape conflicts
jest.mock('./src/services/accessibilityService', () => ({ announce: jest.fn() }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/test-documents/',
  cacheDirectory: '/tmp/test-cache/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));
