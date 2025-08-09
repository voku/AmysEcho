import { validateLandmarkSequence } from '../src/services/TrainingDataValidator';

const makeFlat = (n: number): number[][] => Array.from({ length: n }, (_, i) => [0.1 + i * 0.001, 0.2 + i * 0.001, 0]);

describe('TrainingDataValidator', () => {
  it('flags too few frames', () => {
    const seq = [makeFlat(5)];
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('too_few_frames');
  });

  it('flags insufficient motion', () => {
    const frame = makeFlat(21);
    const seq = Array.from({ length: 15 }, () => frame); // identical frames -> no motion
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('insufficient_motion');
  });

  it('accepts reasonable sample', () => {
    const seq: number[][][] = [];
    let base = makeFlat(21);
    for (let i = 0; i < 15; i++) {
      // create slight motion per frame
      base = base.map(([x, y, z]) => [x + 0.002, y + 0.001, z]);
      seq.push(base);
    }
    const result = validateLandmarkSequence(seq);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});

