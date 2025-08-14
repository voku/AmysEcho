jest.mock('react-native-fast-tflite', () => ({
  TensorflowModel: class {},
  loadTensorflowModel: jest.fn(),
}));

jest.mock('expo-file-system', () => ({}));

describe('extractHandLandmarks', () => {
  it('accepts YUV frames and returns landmarks', () => {
    const { setHandLandmarkModel, extractHandLandmarks } = require('../src/services/landmarkExtractor');

    // Fake model that echoes a simple landmark set
    const fakeModel = {
      runSync: (_: any[]) => [
        [
          [0.1, 0.2, 0.0],
          [0.3, 0.4, 0.0],
        ],
      ],
    };
    setHandLandmarkModel(fakeModel);

    const ab = new ArrayBuffer(10);
    const frame = {
      pixelFormat: 'yuv',
      toArrayBuffer: () => ab,
    } as any;

    const lm = extractHandLandmarks(frame);
    expect(lm).toEqual([
      [0.1, 0.2, 0.0],
      [0.3, 0.4, 0.0],
    ]);
  });

  it('handles flat Float32Array outputs', () => {
    const {
      setHandLandmarkModel,
      extractHandLandmarks,
      extractHandLandmarksFlat,
    } = require('../src/services/landmarkExtractor');

    const data = Float32Array.from({ length: 63 }, (_, i) => i * 0.1);
    const fakeModel = {
      runSync: (_: any[]) => [data],
    };
    setHandLandmarkModel(fakeModel);

    const ab = new ArrayBuffer(10);
    const frame = {
      pixelFormat: 'yuv',
      toArrayBuffer: () => ab,
    } as any;

    const lm = extractHandLandmarks(frame);
    expect(lm).toHaveLength(21);
    expect(lm?.[0][0]).toBeCloseTo(0);
    expect(lm?.[0][1]).toBeCloseTo(0.1);
    expect(lm?.[0][2]).toBeCloseTo(0.2);

    const flat = extractHandLandmarksFlat(frame);
    expect(flat).not.toBeNull();
    expect(flat).toHaveLength(63);
    expect(Array.from(flat!)).toEqual(Array.from(data));
  });
});
