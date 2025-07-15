import { classifyGesture, ClassificationResult } from '../recognizer';

export async function processLandmarks(landmarks: unknown): Promise<ClassificationResult> {
  // Directly leverage the recognizer which already implements
  // the online/offline classification fallback logic.
  return classifyGesture(landmarks);
}
