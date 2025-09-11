module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
   setupFilesAfterEnv: ['<rootDir>/jest.setup.ts', '<rootDir>/test/setupMemory.js'],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-secure-store|expo-haptics|expo-asset|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated))"
  ],
  moduleNameMapper: {
    "\\.task$": "<rootDir>/test/__mocks__/fileMock.js",
    "^react-native-webview$": "<rootDir>/test/__mocks__/react-native-webview.js",
    "gestureDetector\\.js$": "<rootDir>/test/__mocks__/fileMock.js",
    "^\.\./services$": "<rootDir>/src/services/index.ts",
  },
  testTimeout: 10000,
  testMatch: [
    '<rootDir>/test/MediaPipeGestureDetector.test.tsx',
    '<rootDir>/test/useOpenAIValidation.test.tsx',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'webview/**/*.{ts,tsx}',
    '!src/services/parallelGestureProcessor.ts',
    '!src/**/*.d.ts',
    '!webview/**/*.d.ts',
  ],
  coverageProvider: 'v8',
  // Memory optimization settings
  maxWorkers: 2, // Limit concurrent workers
  cache: true, // Enable caching
  clearMocks: true, // Clear mocks between tests
  resetMocks: true, // Reset mocks between tests
   // Increase Node.js memory limit for large test suites
};
