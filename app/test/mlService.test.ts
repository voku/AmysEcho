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
    (mlService as any).circuitBreaker.reset();
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

    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'b' }));
  });

  it('recognizes gestures with high confidence from local model', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureRunSync = jest.fn().mockReturnValue([[0.9, 0.1]]);
    const gestureTflite: any = { runSync: gestureRunSync };

    await mlService.loadModels(landmarkTflite, gestureTflite, ['wave', 'fist'], {
      enableRemoteClassification: false,
    });

    const frame = {
      landmarks: [
        [0, 1, 2],
        [3, 4, 5],
      ],
      width: 1,
      height: 1,
      timestamp: Date.now(),
    } as any;

    const onResult = jest.fn();

    // first call warms up smoothing buffer
    await mlService.processFrameAsync(frame, onResult);
    await mlService.processFrameAsync(frame, onResult);

    const flat = frame.landmarks.flat();
    expect(gestureRunSync).toHaveBeenCalledWith([flat]);
    const lastCall = onResult.mock.calls.at(-1)[0];
    expect(lastCall.label).toBe('wave');
    expect(lastCall.confidence).toBeCloseTo(0.689974, 5);
  });

  it('requests remote classification when worklet prediction confidence is low', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureRunSync = jest.fn();
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
      predictions: { probabilities: [0.5, 0.5], maxProbability: 0.5, maxIndex: 0 },
    } as any;

    const onResult = jest.fn();

    // first call warms up smoothing buffer
    await mlService.processFrameAsync(frame, onResult);
    await mlService.processFrameAsync(frame, onResult);

    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'remote' }));
    expect(gestureRunSync).not.toHaveBeenCalled();
  });
  it('maintains accuracy across jittery frames', async () => {
    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureTflite: any = { runSync: () => [[0.9, 0.1]] };

    await mlService.loadModels(landmarkTflite, gestureTflite, ['wave', 'fist'], {
      enableRemoteClassification: false,
    });

    const base = {
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

    await mlService.processFrameAsync(base, onResult);
    await mlService.processFrameAsync(
      {
        ...base,
        landmarks: [
          [0.01, 0, 0],
          [0, 0.01, 0],
          [0, 0, 0.01],
        ],
      } as any,
      onResult,
    );

    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'wave' }));
  });

  it('records performance metrics', async () => {
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

    await mlService.processFrameAsync(frame, onResult);
    await mlService.processFrameAsync(frame, onResult);

    const metrics = mlService.getPerfMetrics();
    expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('retries remote classification after cooldown', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const landmarkTflite: any = { runSync: () => [[1, 2, 3]] };
    const gestureTflite: any = { runSync: () => [[0.5, 0.5]] };

    await mlService.loadModels(landmarkTflite, gestureTflite, ['a', 'b'], {
      remoteRetryMs: 10,
      processingTimeout: 0,
    });

    const fetchMock = jest.fn().mockRejectedValue(new Error('network error'));
    global.fetch = fetchMock as any;

    const frame = {
      landmarks: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      width: 1,
      height: 1,
      timestamp: Date.now(),
      predictions: { probabilities: [0.5, 0.5], maxProbability: 0.5, maxIndex: 0 },
    } as any;

    const onResult = jest.fn();

    await mlService.processFrameAsync(frame, onResult);
    await mlService.processFrameAsync(frame, onResult);
    await mlService.processFrameAsync(frame, onResult);

    expect(fetchMock).toHaveBeenCalledTimes(3);

    await mlService.processFrameAsync(frame, onResult);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    jest.setSystemTime(new Date(Date.now() + 15));
    jest.advanceTimersByTime(15);

    await mlService.processFrameAsync(frame, onResult);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    jest.useRealTimers();
  });
});

