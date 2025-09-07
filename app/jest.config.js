module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-secure-store|expo-haptics|expo-asset|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated))"
  ],
  moduleNameMapper: {
    "\\.task$": "<rootDir>/test/__mocks__/fileMock.js",
    "^react-native-webview$": "<rootDir>/test/__mocks__/react-native-webview.js",
    "gestureDetector\\.js$": "<rootDir>/test/__mocks__/fileMock.js",
  },
  testTimeout: 10000,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'webview/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!webview/**/*.d.ts',
  ],
};
