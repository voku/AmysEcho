import { describe, expect, it } from 'vitest';
import { validateLandmarkSequence } from './trainingValidator';

const makeFlat = (n: number): number[][] => Array.from({ length: n }, (_, i) => [0.1 + i * 0.001, 0.2 + i * 0.001, 0]);

describe('TrainingDataValidator', () => {
  it('flags too few frames', () => {
    const seq = [[makeFlat(5)]];
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('too_few_frames');
    expect(result.suggestions).toEqual([
      'Nimm etwas länger auf (mindestens 1–2 Sekunden).',
      'Bewege Finger und Hand deutlich, damit die Geste erfasst wird.',
    ]);
  });

  it('flags insufficient motion', () => {
    const frame = [makeFlat(21)];
    const seq = Array.from({ length: 15 }, () => frame); // identical frames -> no motion
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('insufficient_motion');
    expect(result.suggestions).toEqual([
      'Bewege Finger und Hand deutlich, damit die Geste erfasst wird.',
    ]);
  });

  it('accepts reasonable sample', () => {
    const seq: number[][][][] = [];
    let base = [makeFlat(21)];
    for (let i = 0; i < 15; i++) {
      // create slight motion per frame
      base = [base[0].map(([x, y, z]) => [x + 0.002, y + 0.001, z])];
      seq.push(base);
    }
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
