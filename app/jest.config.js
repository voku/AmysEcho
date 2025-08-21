module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-secure-store|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated))"
  ],
  moduleNameMapper: {
    "\\.(tflite|task)$": "<rootDir>/test/__mocks__/fileMock.js",
    "^react-native-webview$": "<rootDir>/test/__mocks__/react-native-webview.js",
  },
};
