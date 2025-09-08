/**
 * Jest Configuration for Integration Tests
 */

export default {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/test/**/*.test.tsx',
    '<rootDir>/../server/test/integration/**/*.test.ts',
    '<rootDir>/../app/test/integration/**/*.test.tsx',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'] }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|react-navigation|@react-navigation|react-native-safe-area-context|@react-native-community|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-native-maps|react-native-paper|react-native-elements|react-native-vector-icons|react-native-gesture-handler|@react-native-async-storage|@react-native-community/netinfo|@react-native-community/masked-view|@react-native-segmented-control|@react-native-picker|@react-native-picker/picker))',
  ],
  setupFilesAfterEnv: ['<rootDir>/setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/../app/src/$1',
    '^@server/(.*)$': '<rootDir>/../server/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '../app/src/**/*.{ts,tsx,js,jsx}',
    '../server/src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.test.{ts,tsx,js,jsx}',
    '!src/**/index.{ts,tsx,js,jsx}',
    '!../app/src/**/*.test.{ts,tsx,js,jsx}',
    '!../server/src/**/*.test.{ts,tsx,js,jsx}',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};