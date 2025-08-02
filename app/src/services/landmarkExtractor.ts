import * as FileSystem from 'expo-file-system';
import { TensorflowModel, loadTensorflowModel } from 'react-native-fast-tflite';
import { HAND_LANDMARKER_MODEL } from '../constants/modelPaths';
import { Frame } from 'react-native-vision-camera';

let handModel: TensorflowModel | null = null;

export function setHandLandmarkModel(model: TensorflowModel | null): void {
  handModel = model;
}

export function extractHandLandmarks(frame: Frame): number[][] | null {
  'worklet';
  if (!handModel) return null;
  try {
    // Assuming frame.buffer contains the raw pixel data as a Uint8Array
    const result = handModel.runSync([new Uint8Array(frame.toArrayBuffer())]) as any[];
    const landmarks = result[0] as number[][] | undefined;
    return landmarks ?? null;
  } catch (e) {
    console.error('Hand landmark extraction failed', e);
    return null;
  }
}

async function loadHandModel(): Promise<void> {
  if (handModel) return;
  handModel = await loadTensorflowModel(HAND_LANDMARKER_MODEL);
}

export async function extractLandmarksFromVideo(videoPath: string): Promise<number[][][]> {
  console.warn('Video-based landmark extraction is not supported.');
  await FileSystem.deleteAsync(videoPath, { idempotent: true });
  return [];
}