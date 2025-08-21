import { classifyGesture, setGestureModel } from '../../src/services/gestureClassifier';

describe('gestureClassifier (services)', () => {
  const makeInput = (n: number) => new Float32Array(Array(n).fill(0.1).map((v, i) => v + (i % 3) * 0.01));

  beforeEach(() => {
    // Inject test double model
    setGestureModel({
      runSync: () => [Float32Array.from([0.05, 0.85, 0.05, 0.03, 0.02])],
    } as any);
  });
  
  afterEach(() => {
    setGestureModel(null as any);
  });
  
  test('should classify known gesture with high confidence', () => {
    const input = makeInput(63);
    const result = classifyGesture(input, { temperature: 1.0 });
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.maxIndex).toBe(1); // index of 0.85
    expect(r.maxProbability).toBeGreaterThan(0.3);
    expect(r.probabilities).toHaveLength(5);
  });
  
  test('should return low confidence for unclear landmarks', () => {
    // Override model to produce near-uniform logits
    setGestureModel({ runSync: () => [Float32Array.from([0.21, 0.20, 0.20, 0.20, 0.19])]} as any);
    const input = makeInput(63);
    const r = classifyGesture(input, { temperature: 1.0 });
    expect(r).not.toBeNull();
    expect(r!.maxProbability).toBeLessThan(0.5);
  });
  
  test('should handle empty landmark input gracefully', () => {
    // classifyGesture expects a Float32Array; an empty input should still return a result or null
    const r = classifyGesture(new Float32Array([]), { temperature: 1.0 });
    expect(r === null || typeof r.maxProbability === 'number').toBe(true);
  });
});
