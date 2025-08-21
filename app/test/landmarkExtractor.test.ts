(globalThis as any).VisionCameraProxy = {};
(global as any).__DEV__ = false;

jest.mock('vision-camera-resize-plugin', () => ({
  createResizePlugin: () => ({
    resize: jest.fn(() => new Float32Array(192 * 192 * 3)),
  }),
  useResizePlugin: () => ({ resize: jest.fn() }),
}));

jest.mock('react-native-fast-tflite', () => ({
  TensorflowModel: class {},
  loadTensorflowModel: jest.fn(),
}));

jest.mock('expo-file-system', () => ({}));

const NUM_HAND_LANDMARKS = 21;
const NUM_COORDINATES = 3;

describe('extractHandLandmarks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns landmarks when hand is detected', () => {
    const { setHandLandmarkModel, extractHandLandmarks } = require('../src/services/landmarkExtractor');

    const landmarkData = new Float32Array(NUM_HAND_LANDMARKS * NUM_COORDINATES);
    landmarkData.set([0.1, 0.2, 0.01, 0.3, 0.4, 0.02]);

    const fakeModel = {
      runSync: (_: any[]) => [
        null,
        new Float32Array([0.9]),
        landmarkData,
      ],
    };
    setHandLandmarkModel(fakeModel as any);

    const frame = { mock: true } as any;

    const lm = extractHandLandmarks(frame);
    expect(lm).not.toBeNull();
    expect(lm).toHaveLength(NUM_HAND_LANDMARKS);
    expect(lm?.[0][0]).toBeCloseTo(0.1);
    expect(lm?.[0][1]).toBeCloseTo(0.2);
    expect(lm?.[0][2]).toBeCloseTo(0.01);
    expect(lm?.[1][0]).toBeCloseTo(0.3);
    expect(lm?.[1][1]).toBeCloseTo(0.4);
    expect(lm?.[1][2]).toBeCloseTo(0.02);
  });

  it('returns null when no hand is detected', () => {
    const { setHandLandmarkModel, extractHandLandmarks } = require('../src/services/landmarkExtractor');

    const fakeModel = {
      runSync: (_: any[]) => [
        null,
        new Float32Array([0.1]),
        new Float32Array(NUM_HAND_LANDMARKS * NUM_COORDINATES),
      ],
    };
    setHandLandmarkModel(fakeModel as any);

    const frame = { mock: true } as any;

    const lm = extractHandLandmarks(frame);
    expect(lm).toBeNull();
  });

  it('returns null when model is not set', () => {
    const { setHandLandmarkModel, extractHandLandmarks } = require('../src/services/landmarkExtractor');

    setHandLandmarkModel(null);
    const frame = { mock: true } as any;

    const lm = extractHandLandmarks(frame);
    expect(lm).toBeNull();
  });
});
