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


jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
}));
jest.mock('./db', () => ({ database: { get: jest.fn(), write: jest.fn() } }));
jest.mock('./db/models', () => ({}));
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(async () => ({ isConnected: true })),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('./src/services/accessibilityService', () => ({ announce: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn() }));
