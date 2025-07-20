import { Frame } from 'react-native-vision-camera';
import { TensorflowModel } from 'react-native-fast-tflite';

let handModel: TensorflowModel | null = null;

/**
 * Register the hand landmark model so it can be used inside a frame processor.
 */
export function setHandLandmarkModel(model: TensorflowModel) {
  handModel = model;
}

/**
 * Extract hand landmarks from a camera frame using the loaded model.
 * This function is intended to run on the worklet thread.
 */
export function extractHandLandmarks(frame: Frame): number[][] | null {
  'worklet';
  if (!handModel) return null;
  try {
    const result = handModel.runSync([frame]) as any[];
    const landmarks = result[0] as number[][] | undefined;
    return landmarks ?? null;
  } catch (e) {
    console.error('Hand landmark extraction failed', e);
    return null;
  }
}
