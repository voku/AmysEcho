import { extractHandLandmarks } from '../src/worklets/extractHandLandmarks.worklet';

describe('extractHandLandmarks worklet', () => {
  it('gracefully handles missing native plugins', () => {
    const frame = {} as any;
    expect(extractHandLandmarks(frame)).toBeNull();
  });
});
