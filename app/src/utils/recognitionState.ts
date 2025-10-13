export type RecognitionPath = 'local' | 'cloud';
export type RecognitionState = 'listening' | 'thinking' | 'confident' | 'uncertain';

export function determineRecognitionState(
  confidence: number,
  localThreshold: number,
): RecognitionState {
  if (confidence >= localThreshold + 0.1) return 'confident';
  if (confidence >= localThreshold - 0.2) return 'thinking';
  return 'uncertain';
}

