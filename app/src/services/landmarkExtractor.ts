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
    if (frame.pixelFormat !== 'rgb') {
      console.warn(`Unsupported pixel format: ${frame.pixelFormat}`);
      return null;
    }
    const buffer = frame.toArrayBuffer();
    const result = handModel.runSync([new Uint8Array(buffer)]) as any[];
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

export async function extractLandmarksFromImages(imagePaths: string[]): Promise<number[][][]> {
  if (!handModel) {
    handModel = await loadTensorflowModel(HAND_LANDMARKER_MODEL);
  }

  const allLandmarks: number[][][] = [];

  for (const imagePath of imagePaths) {
    try {
      const imageData = await FileSystem.readAsStringAsync(imagePath, { encoding: FileSystem.EncodingType.Base64 });
      // In a real scenario, you'd decode base64 to image data and pass to TF model
      // For now, simulate landmark extraction.
      const simulatedLandmarks: number[][] = [[1, 2], [3, 4]]; // Placeholder
      allLandmarks.push(simulatedLandmarks);
      await FileSystem.deleteAsync(imagePath, { idempotent: true });
    } catch (e) {
      console.error('Image-based landmark extraction failed', e);
    }
  }

  return allLandmarks;
}