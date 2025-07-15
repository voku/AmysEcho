import { gestureModel } from '../model';

export type ClassificationResult = {
  label: string;
  confidence: number;
};

// Placeholder classifier using the static gesture model.
export async function classifyGesture(_landmarks: unknown): Promise<ClassificationResult> {
  const first = gestureModel.gestures[0];
  return { label: first.label, confidence: 0.5 };
}
