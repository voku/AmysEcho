jest.mock('react-native-vision-camera', () => ({
  useFrameProcessor: () => {},
}));

const loadTensorflowModelMock = jest
  .fn()
  .mockResolvedValue({ runSync: () => [[0]] });

jest.mock('react-native-fast-tflite', () => ({
  TensorflowModel: class {
    runSync() {
      return [[0]];
    }
  },
  loadTensorflowModel: (...args: any[]) => loadTensorflowModelMock(...args),
}));

jest.mock('react-native-worklets-core', () => ({
  runOnJS: (fn: any) => fn,
}));

const downloadAsyncMock = jest
  .fn()
  .mockResolvedValue({ uri: '/tmp/temp_model.tflite' });

jest.mock('expo-file-system', () => ({
  downloadAsync: (...args: any[]) => downloadAsyncMock(...args),
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

import { mlService } from '../src/services/mlService';

describe('mlService', () => {
  beforeEach(() => {
    mlService.unloadModels();
    (mlService as any).gestureBuffer = [];
    (mlService as any).lastRecognizedGesture = null;
    (mlService as any).lastGestureTime = 0;
    (mlService as any).allowRemote = true;
    (mlService as any).remoteAvailable = true;
    (mlService as any).remoteRetryAt = 0;
    loadTensorflowModelMock.mockClear();
    downloadAsyncMock.mockClear();
    (global as any).fetch = undefined;
  });

  it('should load models and be ready', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureTflite: any = { runSync: () => [[0.1, 0.9]] };

    await mlService.loadModels(landmarkTflite, gestureTflite, []);

    expect(mlService.isServiceReady()).toBe(true);
  });

  it('loads TFLite models from provided URLs', async () => {
    await mlService.loadModels(
      { url: 'file:///landmark.tflite' },
      { url: 'file:///gesture.tflite' },
      [],
    );

    expect(downloadAsyncMock).not.toHaveBeenCalled();
    expect(loadTensorflowModelMock).toHaveBeenNthCalledWith(1, {
      url: 'file:///landmark.tflite',
    });
    expect(loadTensorflowModelMock).toHaveBeenNthCalledWith(2, {
      url: 'file:///gesture.tflite',
    });
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

  it('recognizes gestures with high confidence from local model', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureTflite: any = { runSync: () => [[0.9, 0.1]] };

    await mlService.loadModels(landmarkTflite, gestureTflite, ['wave', 'fist'], {
      enableRemoteClassification: false,
    });

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
      expect.objectContaining({ label: 'wave', confidence: 0.9, isLocal: true }),
      frame.landmarks,
    );
  });

  it('prioritizes remote classification when available', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureRunSync = jest.fn().mockReturnValue([[0.1, 0.9]]);
    const gestureTflite: any = { runSync: gestureRunSync };

    await mlService.loadModels(landmarkTflite, gestureTflite, ['remote', 'local']);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        label: 'remote',
        confidence: 0.95,
        suggestions: ['remote'],
      }),
    }) as any;

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
      expect.objectContaining({ label: 'remote', isLocal: false }),
      frame.landmarks,
    );
    expect(gestureRunSync).not.toHaveBeenCalled();
  });
});