import { classifyGesture, setGestureModel } from '../src/services/gestureClassifier';

describe('classifyGesture temperature scaling', () => {
  afterEach(() => {
    setGestureModel(null as any);
  });

  it('sharpens probabilities when temperature is low', () => {
    const mockModel = { runSync: () => [[2.0, 1.0, 0.5]] };
    setGestureModel(mockModel as any);
    const sample = new Float32Array(63);
    const defaultRes = classifyGesture(sample, { temperature: 1.0 })!;
    const sharpRes = classifyGesture(sample, { temperature: 0.5 })!;
    expect(sharpRes.maxProbability).toBeGreaterThan(defaultRes.maxProbability);
  });
});
