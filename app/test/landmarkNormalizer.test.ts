import { normalizeLandmarks2D, normalizeLandmarksToFlat } from '../src/services/landmarkNormalizer';

function makeHand(): number[][] {
  // Simple synthetic hand: wrist at (0.2,0.3,0), middle tip at (0.4,0.3,0.0)
  const pts: number[][] = new Array(21).fill(0).map(() => [0, 0, 0]);
  pts[0] = [0.2, 0.3, 0.0]; // wrist
  pts[12] = [0.4, 0.3, 0.0]; // middle tip
  // populate other points around wrist
  for (let i = 1; i < 21; i++) {
    if (i === 12) continue;
    pts[i] = [0.2 + i * 0.001, 0.3 + i * 0.001, 0];
  }
  return pts;
}

test('normalizeLandmarks2D translates wrist to origin and scales by hand size', () => {
  const hand = makeHand();
  const norm = normalizeLandmarks2D(hand);
  // wrist becomes origin
  expect(norm[0][0]).toBeCloseTo(0, 5);
  expect(norm[0][1]).toBeCloseTo(0, 5);
  // middle tip roughly at unit distance along x
  expect(norm[12][0]).toBeCloseTo(1, 5);
  expect(norm[12][1]).toBeCloseTo(0, 5);
});

test('normalizeLandmarksToFlat returns a flattened float array of length 63', () => {
  const hand = makeHand();
  const flat = normalizeLandmarksToFlat(hand);
  expect(flat).toBeInstanceOf(Float32Array);
  expect(flat.length).toBe(21 * 3);
});

