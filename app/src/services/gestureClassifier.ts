import { TensorflowModel } from 'react-native-fast-tflite';
import { logger } from '../utils/logger';

let gestureModel: TensorflowModel | null = null;

export function setGestureModel(model: TensorflowModel | null): void {
  gestureModel = model;
}

export function classifyGesture(input: number[]): number[] | null {
  'worklet';
  if (!gestureModel) return null;
  try {
    const tensor = new Float32Array(input);
    const result = gestureModel.runSync([tensor]) as any[];
    const predictions = result[0] as number[] | undefined;
    return predictions ?? null;
  } catch (e) {
    logger.error('Gesture classification failed', e);
    return null;
  }
}
