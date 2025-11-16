module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '<rootDir>/test/setupMemory.js'],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-secure-store|expo-haptics|expo-asset|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))"
  ],
  moduleNameMapper: {
    "\\.task$": "<rootDir>/test/__mocks__/fileMock.js",
    "\\.npz$": "<rootDir>/test/__mocks__/fileMock.js",
    "^react-native-webview$": "<rootDir>/test/__mocks__/react-native-webview.js",
    "gestureDetector\\.js$": "<rootDir>/test/__mocks__/fileMock.js",
    "^\.\./services$": "<rootDir>/src/services/index.ts",
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 10000,
  testMatch: [
    '<rootDir>/test/**/*.test.ts?(x)',
    '<rootDir>/webview/__tests__/**/*.test.ts?(x)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'webview/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!webview/**/*.d.ts',
  ],
  coverageProvider: 'v8',
  // Memory optimization settings
  maxWorkers: 1, // Run tests serially to reduce memory
  cache: true, // Enable caching
  clearMocks: true, // Clear mocks between tests
  resetMocks: true, // Reset mocks between tests
  // Increase Node.js memory limit for large test suites
};
