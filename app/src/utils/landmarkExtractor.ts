import { Frame } from 'react-native-vision-camera';
import { TensorflowModel } from 'react-native-fast-tflite';

let handModel: TensorflowModel | null = null;

export function setHandLandmarkModel(model: TensorflowModel | null): void {
  handModel = model;
}

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
