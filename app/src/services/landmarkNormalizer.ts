// Utilities for normalizing hand landmarks before classification
// Strategy: translate to wrist; scale all axes by max(|x| + |y| + |z|)

const WRIST_INDEX = 0;

export function normalizeLandmarks(landmarks: number[][]): number[][] {
  if (!landmarks || landmarks.length < 21) return [];

  const [wx, wy, wz] = landmarks[WRIST_INDEX];
  const translated = landmarks.map(([x, y, z]) => [
    x - wx,
    y - wy,
    (z ?? 0) - (wz ?? 0),
  ]);

  let maxd = 0;
  for (const [x, y, z] of translated) {
    const d = Math.abs(x) + Math.abs(y) + Math.abs(z);
    if (d > maxd) maxd = d;
  }
  const scale = maxd || 1;
  return translated.map(([x, y, z]) => [x / scale, y / scale, z / scale]);
}

export function normalizeLandmarksToFlat(landmarks: number[][]): Float32Array {
  if (!landmarks || landmarks.length < 21) return new Float32Array(0);
  const norm = normalizeLandmarks(landmarks);
  const out = new Float32Array(norm.length * 3);
  let k = 0;
  for (const [x, y, z] of norm) {
    out[k++] = x;
    out[k++] = y;
    out[k++] = z;
  }
  return out;
}
