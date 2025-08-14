import { extractHandLandmarksFlat } from '../src/services/landmarkExtractor';

describe('extractHandLandmarksFlat worklet', () => {
  it('gracefully handles missing model', () => {
    const frame = {} as any;
    expect(extractHandLandmarksFlat(frame)).toBeNull();
  });
});
