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
});
