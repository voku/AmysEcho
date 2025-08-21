import { determineRecognitionState } from '../src/utils/recognitionState';

describe('determineRecognitionState', () => {
  const threshold = 0.6;

  test('confident when confidence >= threshold + 0.1', () => {
    expect(determineRecognitionState(0.75, threshold)).toBe('confident');
    expect(determineRecognitionState(1.0, threshold)).toBe('confident');
  });

  test('thinking near threshold window', () => {
    expect(determineRecognitionState(0.6, threshold)).toBe('thinking');
    expect(determineRecognitionState(0.45, threshold)).toBe('thinking');
  });

  test('uncertain below lower bound', () => {
    expect(determineRecognitionState(0.2, threshold)).toBe('uncertain');
  });
});

