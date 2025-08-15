import { TensorflowModel } from 'react-native-fast-tflite';
import { Worklets } from 'react-native-worklets-core';
import { logger } from '../utils/logger';

let gestureModel: TensorflowModel | null = null;
let inputBuffer: Float32Array | null = null;
let outputBuffer: Float32Array | null = null;
const logError = Worklets?.createRunOnJS
  ? Worklets.createRunOnJS(logger.error)
  : (message?: any, ...optional: any[]) => logger.error(message, ...optional);

export function setGestureModel(model: TensorflowModel | null): void {
  gestureModel = model;
}

export function classifyGesture(
  input: Float32Array,
  confidenceThreshold: number = 0.7,
): number[] | null {
  'worklet';
  if (!gestureModel) return null;
  try {
    if (!inputBuffer || inputBuffer.length !== input.length) {
      inputBuffer = new Float32Array(input.length);
    }
    inputBuffer.set(input);
    const result = gestureModel.runSync([inputBuffer]) as any[];
    const logits = result[0] as ArrayLike<number> | undefined;
    if (!logits) return null;

    const len = logits.length;
    if (!outputBuffer || outputBuffer.length !== len) {
      outputBuffer = new Float32Array(len);
    }

    // Apply softmax to convert logits into probabilities
    let maxLogit = -Infinity;
    for (let i = 0; i < len; i++) {
      const v = logits[i];
      if (v > maxLogit) maxLogit = v;
    }

    let sum = 0;
    for (let i = 0; i < len; i++) {
      const e = Math.exp(logits[i] - maxLogit);
      outputBuffer[i] = e;
      sum += e;
    }

    let maxProb = 0;
    for (let i = 0; i < len; i++) {
      const prob = outputBuffer[i] / sum;
      outputBuffer[i] = prob;
      if (prob > maxProb) maxProb = prob;
    }

    if (maxProb > confidenceThreshold) {
      return Array.from(outputBuffer);
    }
    return null;
  } catch (e) {
    logError('Gesture classification failed', e);
    return null;
  }
}
