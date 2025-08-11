import * as FileSystem from 'expo-file-system';
import { TensorflowModel, loadTensorflowModel } from 'react-native-fast-tflite';
import { HAND_LANDMARKER_MODEL } from '../constants/modelPaths';
import { Frame } from 'react-native-vision-camera';
import { logger } from '../utils/logger';

let handModel: TensorflowModel | null = null;
let resizePlugin: ReturnType<typeof import('vision-camera-resize-plugin').createResizePlugin> | null = null;

if ((globalThis as any).VisionCameraProxy) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createResizePlugin } = require('vision-camera-resize-plugin');
    resizePlugin = createResizePlugin();
  } catch {
    resizePlugin = null;
  }
}

export function setHandLandmarkModel(model: TensorflowModel | null): void {
  handModel = model;
}

export function extractHandLandmarks(frame: Frame): number[][] | null {
  'worklet';
  if (!handModel) return null;
  try {
    const input = resizePlugin
      ? resizePlugin.resize(frame, {
          scale: { width: 192, height: 192 },
          pixelFormat: 'rgb',
          dataType: 'uint8',
        })
      : new Uint8Array(frame.toArrayBuffer());
    const result = handModel.runSync([input]) as any[];
    const landmarks = result[0] as number[][] | undefined;
    return landmarks ?? null;
  } catch (e) {
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
      logger.error('Image-based landmark extraction failed', e);
    }
  }

  return allLandmarks;
}
