import type { CentroidMap } from './dgsModelClient';

function normalize(lm: number[][]): number[][] {
  if (!lm || lm.length < 21) return lm;
  const [wx, wy, wz] = lm[0];
  const pts = lm.map(([x, y, z]) => [x - wx, y - wy, (z ?? 0) - (wz ?? 0)]);
  let maxd = 0;
  for (const [x, y] of pts) maxd = Math.max(maxd, Math.abs(x) + Math.abs(y));
  const s = maxd || 1;
  return pts.map(([x, y, z]) => [x / s, y / s, z]);
}

export function classifyWithCentroids(lm: number[][], centroids: CentroidMap): { label: string; confidence: number } | null {
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

