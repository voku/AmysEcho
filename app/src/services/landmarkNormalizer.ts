// Utilities for normalizing hand landmarks before classification
// Strategy: translate to wrist, scale by max(|x| + |y|) to match server/WebView logic

const WRIST_INDEX = 0;

export function normalizeLandmarks(
  landmarks: number[][],
): number[][] {
  if (!landmarks || landmarks.length < 21) return landmarks;

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
  return translated.map(([x, y, z]) => [x / scale, y / scale, z]);
}

export function normalizeLandmarksToFlat(landmarks: number[][]): Float32Array {
  const norm = normalizeLandmarks(landmarks);
  const out = new Float32Array(norm.length * 3);
  let k = 0;
  for (let i = 0; i < norm.length; i++) {
    out[k++] = norm[i][0];
    out[k++] = norm[i][1];
    out[k++] = norm[i][2] ?? 0;
  }
  return out;
}
