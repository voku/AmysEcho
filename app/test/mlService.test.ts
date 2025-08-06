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
  beforeEach(() => {
    mlService.unloadModels();
    (mlService as any).gestureBuffer = [];
    (mlService as any).lastRecognizedGesture = null;
    (mlService as any).lastGestureTime = 0;
    jest.resetAllMocks();
  });

  it('should load models and be ready', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureTflite: any = { runSync: () => [[0.1, 0.9]] };

    await mlService.loadModels(landmarkTflite, gestureTflite, []);

    expect(mlService.isServiceReady()).toBe(true);
  });

  it('falls back to local model when remote classification fails', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureTflite: any = { runSync: () => [[0.2, 0.8]] };

    await mlService.loadModels(landmarkTflite, gestureTflite, ['a', 'b']);

    // simulate remote API failure
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as any;

    const frame = {
      landmarks: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      width: 1,
      height: 1,
      timestamp: Date.now(),
    } as any;

    const onResult = jest.fn();

    // first call warms up smoothing buffer
    await mlService.processFrameAsync(frame, onResult);
    await mlService.processFrameAsync(frame, onResult);

    expect(onResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: 'b', isLocal: true }),
      frame.landmarks,
    );
  });
});