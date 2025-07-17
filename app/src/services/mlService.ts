import { gestureModel } from '../model';
import offlineModel from '../assets/model/offlineModel.json';
import { TFLiteModel } from 'react-native-fast-tflite';

type OfflineModel = Record<string, number[]>;
const model: OfflineModel = offlineModel as OfflineModel;
let tfliteModel: TFLiteModel | null = null;

export async function loadModels(): Promise<void> {
  if (tfliteModel) return;
  tfliteModel = await TFLiteModel.createFromFile(
    require('../assets/models/gestures.tflite'),
  );
}

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
  if (tfliteModel) {
    const res = (await tfliteModel.run(landmarks)) as any[];
    if (Array.isArray(res) && res.length > 0) {
      const best = res.reduce((p, c) => (p.confidence > c.confidence ? p : c));
      return { label: best.label, confidence: best.confidence };
    }
  }
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

export const mlService = {
  loadModels,
  classifyGesture,
};
