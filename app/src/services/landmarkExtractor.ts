import * as FileSystem from 'expo-file-system';
import { TensorflowModel, loadTensorflowModel } from 'react-native-fast-tflite';
import type { Frame } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { HAND_LANDMARKER_MODEL } from '../constants/modelPaths';
import { logger } from '../utils/logger';

let handModel: TensorflowModel | null = null;

let resizePlugin: any | null = null;

const NUM_HAND_LANDMARKS = 21;
const NUM_COORDINATES = 3;
const FLATTENED_LANDMARKS_SIZE = NUM_HAND_LANDMARKS * NUM_COORDINATES;

if ((globalThis as any).VisionCameraProxy) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createResizePlugin } = require('vision-camera-resize-plugin');
    resizePlugin = createResizePlugin();
  } catch {
    resizePlugin = null;
  }
} else {
  logger.warn('VisionCameraProxy not found; using ArrayBuffer fallback');
}

export function isResizePluginAvailable(): boolean {
  return resizePlugin != null;
}

export function setHandLandmarkModel(model: TensorflowModel | null): void {
  handModel = model;
}

const logErrorJS = Worklets?.createRunOnJS
  ? Worklets.createRunOnJS((m: string) => logger.error(m))
  : (m: string) => console.error(m);
const logJS = Worklets?.createRunOnJS
  ? Worklets.createRunOnJS((m: string) => logger.debug(m))
  : (m: string) => console.log(m);
let useResizePlugin: any = () => ({ resize: () => { throw new Error('resize plugin unavailable'); } });
if ((globalThis as any).VisionCameraProxy) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    useResizePlugin = require('vision-camera-resize-plugin').useResizePlugin;
  } catch {}
}
let lastLog = 0;
const logLandmarks = Worklets?.createRunOnJS
  ? Worklets.createRunOnJS((pts: number[][] | null) =>
      console.log('LM raw:', Array.isArray(pts) ? pts.slice(0, 2) : pts),
    )
  : (_: number[][] | null) => {};

function reshapeLandmarks(raw: any): number[][] | null {
  'worklet';
  let values: number[] | null = null;
  if (Array.isArray(raw)) {
    if (Array.isArray(raw[0])) {
      return raw as number[][];
    }
    values = raw as number[];
  } else if (raw && typeof raw === 'object' && 'length' in raw) {
    values = Array.from(raw as ArrayLike<number>);
  }
  if (!values || values.length !== FLATTENED_LANDMARKS_SIZE) return null;
  const landmarks: number[][] = [];
  for (let i = 0; i < NUM_HAND_LANDMARKS; i++) {
    const base = i * NUM_COORDINATES;
    landmarks.push([values[base], values[base + 1], values[base + 2]]);
  }
  return landmarks;
}

export function useHandLandmarkExtractor(): (frame: Frame) => number[][] | null {
  const { resize } = useResizePlugin();
  return (frame: Frame): number[][] | null => {
    'worklet';
    if (!handModel) return null;
    try {
      const input = resize(frame, {
        scale: { width: 192, height: 192 },
        pixelFormat: 'rgb',
        dataType: 'uint8',
      });
      const result = handModel.runSync([input]) as any[];
      const landmarks = reshapeLandmarks(result[0]);
      const confSource = result[1];
      let conf = 0;
      if (confSource && typeof confSource === 'object' && 'length' in confSource) {
        conf = (confSource as any)[0] ?? 0;
      }
      if (__DEV__ && Date.now() - lastLog > 500) {
        lastLog = Date.now();
        logJS(`LM ok: ${landmarks?.length ?? 0} pts, conf=${conf.toFixed(2)}`);
      }
      return landmarks;
    } catch (e: any) {
      logErrorJS(e.message);
      return null;
    }
  };
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
    const landmarks = reshapeLandmarks(result[0]);
    if (typeof __DEV__ !== 'undefined' && __DEV__ && Date.now() - lastLog > 500) {
      lastLog = Date.now();
      logLandmarks(landmarks);
    }
    return landmarks;
  } catch (e: any) {
    logErrorJS(e.message);
    return null;
  }
}

export function extractHandLandmarksFlat(frame: Frame): Float32Array | null {
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
    const raw = result[0];
    let flat: Float32Array | null = null;
    if (Array.isArray(raw) && Array.isArray(raw[0])) {
      flat = Float32Array.from((raw as number[][]).flat());
    } else if (raw && typeof raw === 'object' && 'length' in raw) {
      flat = Float32Array.from(raw as ArrayLike<number>);
    }
    return flat && flat.length === FLATTENED_LANDMARKS_SIZE ? flat : null;
  } catch (e: any) {
    logErrorJS(e.message);
    return null;
  }
}

async function loadHandModel(): Promise<void> {
  if (handModel) return;
  handModel = await loadTensorflowModel(HAND_LANDMARKER_MODEL);
}

export async function extractLandmarksFromImages(imagePaths: string[]): Promise<number[][][]> {
  if (!handModel) {
    await loadHandModel();
  }

  const allLandmarks: number[][][] = [];

  for (const imagePath of imagePaths) {
    try {
      const imageData = await FileSystem.readAsStringAsync(imagePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const simulatedLandmarks: number[][] = [[1, 2], [3, 4]]; // Placeholder
      allLandmarks.push(simulatedLandmarks);
      await FileSystem.deleteAsync(imagePath, { idempotent: true });
    } catch (e) {
      logger.error('Image-based landmark extraction failed', e);
    }
  }

  return allLandmarks;
}
