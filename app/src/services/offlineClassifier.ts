import type { CentroidMap, Point } from './dgsModelClient';
import { normalizeLandmarks as normalizeSingleHand } from './landmarkNormalizer';

// NOTE: keep `normalizeLandmarks` logic in sync with
// server/src/services/dgsModelService.ts
const HAND_SIZE = 21;

function pad(hand: Point[]): Point[] {
  const out = hand.slice(0, HAND_SIZE);
  while (out.length < HAND_SIZE) out.push([0, 0, 0] as Point);
  return out;
}

export function normalize(lm: Point[] | null | undefined): Point[] {
  const src = (lm ?? []) as Point[];
  const seg1 = src.slice(0, HAND_SIZE);
  const seg2 = src.slice(HAND_SIZE, HAND_SIZE * 2);
  const hand1 = pad(normalizeSingleHand(seg1));
  const hand2 = pad(normalizeSingleHand(seg2));
  return hand1.concat(hand2);
}

export function classifyWithCentroids(
  lm: Point[] | null | undefined,
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
      const dz = (q[i][2] ?? 0) - (c[i][2] ?? 0);
      d += dx * dx + dy * dy + dz * dz;
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
