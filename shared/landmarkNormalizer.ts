// Shared utilities for normalizing hand landmarks
// Strategy: translate each hand to its wrist and scale by max(|x| + |y| + |z|)

export function normalizeHands(lm: number[][]): number[][] {
  if (!lm || lm.length === 0) return lm;
  const pts = lm.map((p) => [...p]);

  const normalizeHand = (start: number) => {
    if (pts.length < start + 1) return;
    const [wx, wy, wz] = pts[start];
    let maxd = 0;
    for (let i = 0; i < 21 && start + i < pts.length; i++) {
      const [x, y, z] = pts[start + i];
      const nx = x - wx;
      const ny = y - wy;
      const nz = (z ?? 0) - (wz ?? 0);
      pts[start + i] = [nx, ny, nz];
      maxd = Math.max(maxd, Math.abs(nx) + Math.abs(ny) + Math.abs(nz));
    }
    const s = maxd || 1;
    for (let i = 0; i < 21 && start + i < pts.length; i++) {
      const [x, y, z] = pts[start + i];
      pts[start + i] = [x / s, y / s, z / s];
    }
  };

  normalizeHand(0);
  if (pts.length >= 42) normalizeHand(21);

  return pts;
}

export function normalizeLandmarks(landmarks: number[][]): number[][] {
  if (!landmarks || landmarks.length < 21) return [];
  const norm = normalizeHands(landmarks.slice(0, 21));
  return norm.slice(0, 21);
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
