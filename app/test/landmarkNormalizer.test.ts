import { normalizeLandmarks, normalizeLandmarksToFlat } from '../src/services/landmarkNormalizer';

function makeHand(): number[][] {
  // Synthetic hand with depth: wrist at (0.2,0.3,0.1), middle tip at (0.4,0.3,0.3)
  const pts: number[][] = new Array(21).fill(0).map(() => [0, 0, 0]);
  pts[0] = [0.2, 0.3, 0.1]; // wrist
  pts[12] = [0.4, 0.3, 0.3]; // middle tip
  // populate other points around wrist with increasing depth
  for (let i = 1; i < 21; i++) {
    if (i === 12) continue;
    pts[i] = [0.2 + i * 0.001, 0.3 + i * 0.001, 0.1 + i * 0.001];
  }
  return pts;
}

test('normalizeLandmarks translates wrist to origin and scales by max |x|+|y|', () => {
  const hand = makeHand();
  const norm = normalizeLandmarks(hand);
  // wrist becomes origin
  expect(norm[0][0]).toBeCloseTo(0, 5);
  expect(norm[0][1]).toBeCloseTo(0, 5);
  expect(norm[0][2]).toBeCloseTo(0, 5);
  // middle tip becomes unit distance along x
  expect(norm[12][0]).toBeCloseTo(1, 5);
  expect(norm[12][1]).toBeCloseTo(0, 5);
  expect(norm[12][2]).toBeCloseTo(1, 5);
});

test('normalizeLandmarksToFlat returns a flattened float array of length 63', () => {
  const hand = makeHand();
  const flat = normalizeLandmarksToFlat(hand);
  expect(flat).toBeInstanceOf(Float32Array);
  expect(flat.length).toBe(21 * 3);
  // z of middle tip is scaled to 1
  expect(flat[12 * 3 + 2]).toBeCloseTo(1, 5);
});

test('normalizeLandmarks returns empty array for short input', () => {
  expect(normalizeLandmarks([])).toEqual([]);
  expect(normalizeLandmarks([[1, 2, 3]])).toEqual([]);
});

test('normalizeLandmarksToFlat returns empty array for short input', () => {
  let flat = normalizeLandmarksToFlat([]);
  expect(flat).toBeInstanceOf(Float32Array);
  expect(flat.length).toBe(0);
  flat = normalizeLandmarksToFlat([[1, 2, 3]]);
  expect(flat).toBeInstanceOf(Float32Array);
  expect(flat.length).toBe(0);
});
