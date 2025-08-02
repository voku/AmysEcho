jest.mock('react-native-vision-camera', () => ({
  useFrameProcessor: () => {},
}));

import { mlService } from '../src/services/mlService';

jest.mock('react-native-fast-tflite', () => ({
  TensorflowModel: class {
    runSync() {
      return [[0]];
    }
  },
  loadTensorflowModel: async () => ({
    runSync: () => [[0]],
  }),
}));

jest.mock('react-native-worklets-core', () => ({
  runOnJS: (fn: any) => fn,
}));

jest.mock('expo-file-system', () => ({
  downloadAsync: async () => ({ uri: 'test' }),
  documentDirectory: '/tmp/',
}));

jest.mock('../db', () => ({
  database: {
    write: async () => {},
    get: () => ({
      create: () => {},
      query: () => ({ fetch: async () => [] }),
    }),
  },
  InteractionLog: class {},
}));

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (value: any) => ({ value }),
}));

describe('mlService', () => {
  it('should load models and be ready', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureTflite: any = { runSync: () => [[0.1, 0.9]] };

    await mlService.loadModels(landmarkTflite, gestureTflite, []);

    expect(mlService.isServiceReady()).toBe(true);
  });
});