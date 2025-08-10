jest.mock('react-native-reanimated', () => ({
  runOnJS: (fn: any) => fn,
}));

import { classifyGesture, setGestureModel } from '../src/services/gestureClassifier';

describe('classifyGesture buffer reuse', () => {
  afterEach(() => {
    setGestureModel(null as any);
  });

  it('reuses the same input buffer across invocations', () => {
    const seen: any[] = [];
    const mockModel = {
      runSync: (args: any[]) => {
        seen.push(args[0]);
        return [[0.1, 0.2]];
      },
    };
    setGestureModel(mockModel as any);

    const sample = new Float32Array([1, 2, 3, 4]);
    classifyGesture(sample);
    classifyGesture(sample);

    expect(seen.length).toBe(2);
    expect(seen[0]).toBe(seen[1]);
  });
});
