import { determineRecognitionState } from '../src/utils/recognitionState';

describe('determineRecognitionState', () => {
  // Amy First: Lower threshold for imperfect gestures (22q11 syndrome)
  const threshold = 0.5;

  test('confident when confidence >= threshold + 0.1', () => {
    expect(determineRecognitionState(0.65, threshold)).toBe('confident');
    expect(determineRecognitionState(1.0, threshold)).toBe('confident');
  });

  test('thinking near threshold window', () => {
    expect(determineRecognitionState(0.5, threshold)).toBe('thinking');
    expect(determineRecognitionState(0.35, threshold)).toBe('thinking');
  });

  test('uncertain below lower bound', () => {
    expect(determineRecognitionState(0.2, threshold)).toBe('uncertain');
  });
});

