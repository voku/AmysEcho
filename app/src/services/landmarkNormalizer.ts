// Utilities for normalizing hand landmarks before classification
// Strategy: translate to wrist; scale all axes by max(|x| + |y| + |z|)

export type Point = [number, number, number];

const WRIST_INDEX = 0;
const HAND_SIZE = 21;

// NOTE: expects a single hand. Callers must slice before passing.
export function normalizeLandmarks(landmarks: Point[]): Point[] {
  if (!landmarks || landmarks.length === 0) {
    return [];
  }

  const hand = landmarks.slice(0, HAND_SIZE);
  const wrist = hand[WRIST_INDEX];
  if (!wrist) {
    return [];
  }
  const [wx = 0, wy = 0, wzRaw = 0] = wrist;
  const translated = hand.map((point) => {
    const [x = 0, y = 0, z = 0] = point ?? [];
    return [
      x - wx,
      y - wy,
      (z ?? 0) - (wzRaw ?? 0),
    ] as Point;
  });

  const maxd = translated.reduce(
    (currentMax, [x, y, z]) =>
      Math.max(currentMax, Math.abs(x) + Math.abs(y) + Math.abs(z)),
    0,
  );
  const scale = maxd || 1;
  return translated.map(([x, y, z]) => [x / scale, y / scale, z / scale] as Point);
}

export function normalizeLandmarksToFlat(landmarks: Point[]): Float32Array {
  if (!landmarks || landmarks.length < HAND_SIZE) return new Float32Array(0);
  const norm = normalizeLandmarks(landmarks.slice(0, HAND_SIZE));
  const out = new Float32Array(norm.length * 3);
  let k = 0;
  for (const [x, y, z] of norm) {
    out[k++] = x;
    out[k++] = y;
    out[k++] = z;
  }
  return out;
}
