import type { CentroidMap } from './dgsModelClient';

// NOTE: keep this normalize function in sync with
// server/src/services/dgsModelService.ts
export function normalize(lm: number[][]): number[][] {
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

export function classifyWithCentroids(
  lm: number[][],
  centroids: CentroidMap,
): { label: string; confidence: number } | null {
  const q = normalize(lm);
  let bestLabel: string | null = null;
  let bestScore = -Infinity;
  let sumScores = 0;
  for (const [label, c] of Object.entries(centroids)) {
    const m = Math.min(q.length, c.length);
    let d = 0;
    for (let i = 0; i < m; i++) {
      const dx = q[i][0] - c[i][0];
      const dy = q[i][1] - c[i][1];
      d += dx * dx + dy * dy;
    }
    const score = 1.0 / (1e-6 + Math.sqrt(d));
    sumScores += score;
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }
  if (!bestLabel || sumScores <= 0) return null;
  const confidence = Math.max(0, Math.min(1, bestScore / sumScores));
  return { label: bestLabel, confidence: Math.round(confidence * 1000) / 1000 };
}
