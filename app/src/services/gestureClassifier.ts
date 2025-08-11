import { TensorflowModel } from 'react-native-fast-tflite';
import { Worklets } from 'react-native-worklets-core';
import { logger } from '../utils/logger';

let gestureModel: TensorflowModel | null = null;
let inputBuffer: Float32Array | null = null;
const logError = Worklets?.createRunOnJS
  ? Worklets.createRunOnJS(logger.error)
  : (message?: any, ...optional: any[]) => logger.error(message, ...optional);

export function setGestureModel(model: TensorflowModel | null): void {
  gestureModel = model;
}

export function classifyGesture(input: Float32Array): number[] | null {
  'worklet';
  if (!gestureModel) return null;
  try {
    if (!inputBuffer || inputBuffer.length !== input.length) {
      inputBuffer = new Float32Array(input.length);
    }
    inputBuffer.set(input);
    const result = gestureModel.runSync([inputBuffer]) as any[];
    const predictions = result[0] as number[] | undefined;
    return predictions ?? null;
  } catch (e) {
    logError('Gesture classification failed', e);
    return null;
  }
}
