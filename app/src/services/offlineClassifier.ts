import type { CentroidMap } from './dgsModelClient';
import { normalizeLandmarks as normalizeSingleHand } from './landmarkNormalizer';

// NOTE: keep `normalizeLandmarks` logic in sync with
// server/src/services/dgsModelService.ts
export function normalize(lm: number[][]): number[][] {
  if (!lm || lm.length === 0) return lm;

  const hand1 = normalizeSingleHand(lm.slice(0, 21));
  if (lm.length <= 21) return hand1;

  const hand2 = normalizeSingleHand(lm.slice(21, 42));
  return hand1.concat(hand2);
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
