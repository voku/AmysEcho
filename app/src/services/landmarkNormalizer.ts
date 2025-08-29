// Utilities for normalizing hand landmarks before classification
// Strategy: translate to wrist; scale all axes by max(|x| + |y|) over translated points (matches server/WebView)

const WRIST_INDEX = 0;

export function normalizeLandmarks(
  landmarks: number[][],
): number[][] {
  if (!landmarks || landmarks.length < 21) return [];

  const [wx, wy, wz] = landmarks[WRIST_INDEX];
  const translated = landmarks.map((p) => [
    p[0] - wx,
    p[1] - wy,
    (p[2] ?? 0) - (wz ?? 0),
  ]);

  let maxd = 0;
  for (const [x, y] of translated) {
    const d = Math.abs(x) + Math.abs(y);
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
  for (let i = 0; i < norm.length; i++) {
    out[k++] = norm[i][0];
    out[k++] = norm[i][1];
    out[k++] = norm[i][2];
  }
  return out;
}
