import { gestureModel } from '../model';
import offlineModel from '../assets/model/offlineModel.json';

type OfflineModel = Record<string, number[]>;
const model: OfflineModel = offlineModel as OfflineModel;

export type ClassificationResult = {
  label: string;
  confidence: number;
};

function distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Simple offline classifier using the bundled centroid model.
export async function classifyGesture(landmarks: unknown): Promise<ClassificationResult> {
  if (!Array.isArray(landmarks)) {
    const first = gestureModel.gestures[0];
    return { label: first.label, confidence: 0 };
  }

  const input = (landmarks as number[]).map(Number);
  let bestId = '';
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [id, centroid] of Object.entries(model)) {
    const score = distance(input, centroid);
    if (score < bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  const match = gestureModel.gestures.find((g) => g.id === bestId);
  const label = match ? match.label : bestId || 'unknown';
  const confidence = 1 / (1 + bestScore);
  return { label, confidence };
}
