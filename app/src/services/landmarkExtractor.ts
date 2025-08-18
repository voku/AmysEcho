import * as FileSystem from 'expo-file-system';
import { TensorflowModel, loadTensorflowModel } from 'react-native-fast-tflite';
import type { Frame } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { HAND_LANDMARKER_MODEL } from '../constants/modelPaths';
import { logger } from '../utils/logger';

let handModel: TensorflowModel | null = null;

let resizePlugin: any | null | undefined = undefined;

const NUM_HAND_LANDMARKS = 21;
const NUM_COORDINATES = 3;

function getResizePlugin() {
  if (resizePlugin === undefined) {
    if ((globalThis as any).VisionCameraProxy) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createResizePlugin } = require('vision-camera-resize-plugin');
        resizePlugin = createResizePlugin();
        logger.info('VisionCamera Resize Plugin loaded successfully.');
      } catch (e) {
        logger.error('Failed to load VisionCamera Resize Plugin', e);
        resizePlugin = null;
      }
    } else {
      logger.warn('VisionCameraProxy not found; resize plugin disabled.');
      resizePlugin = null;
    }
  }
  return resizePlugin;
}

export function isResizePluginAvailable(): boolean {
  return getResizePlugin() != null;
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
const logWarnJS = Worklets?.createRunOnJS
  ? Worklets.createRunOnJS((m: string) => logger.warn(m))
  : (m: string) => console.warn(m);
let useResizePlugin: any = () => ({ resize: () => { throw new Error('resize plugin unavailable'); } });
if ((globalThis as any).VisionCameraProxy) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    useResizePlugin = require('vision-camera-resize-plugin').useResizePlugin;
  } catch {}
}
let lastLog = 0;
let lensLoggedOnce = false;
const logLandmarks = Worklets?.createRunOnJS
  ? Worklets.createRunOnJS((pts: number[][] | null) =>
      console.log('LM raw:', Array.isArray(pts) ? pts.slice(0, 2) : pts),
    )
  : (_: number[][] | null) => {};

function reshapeTo2D(raw: Float32Array): number[][] | null {
  'worklet';
  const expected = NUM_HAND_LANDMARKS * NUM_COORDINATES;
  if (raw.length !== expected) return null;
  const out: number[][] = new Array(NUM_HAND_LANDMARKS);
  for (let i = 0; i < NUM_HAND_LANDMARKS; i++) {
    const base = i * NUM_COORDINATES;
    out[i] = [raw[base], raw[base + 1], raw[base + 2]];
  }
  return out;
}

function reshapeHandsFromFlat(raw: Float32Array): number[][][] {
  'worklet';
  const chunk = NUM_HAND_LANDMARKS * NUM_COORDINATES;
  const hands: number[][][] = [];
  if (raw.length < chunk) return hands;
  const count = Math.floor(raw.length / chunk);
  for (let h = 0; h < count; h++) {
    const start = h * chunk;
    const view = raw.subarray(start, start + chunk);
    const hand = reshapeTo2D(view);
    if (hand) hands.push(hand);
  }
  return hands;
}

function toFloat32(arrLike: any): Float32Array | null {
  'worklet';
  if (!arrLike) return null;
  if (arrLike instanceof Float32Array) return arrLike as Float32Array;
  if (ArrayBuffer.isView(arrLike)) return new Float32Array(arrLike as any);
  if (Array.isArray(arrLike)) return new Float32Array(arrLike as any);
  return null;
}

function reshapeHandsGeneric(raw0: any): number[][][] {
  'worklet';
  // Prefer flat float path
  const flat = toFloat32(raw0);
  if (flat && flat.length >= NUM_HAND_LANDMARKS * NUM_COORDINATES) {
    return reshapeHandsFromFlat(flat);
  }
  // Fallback: nested arrays [[x,y,z], ...] possibly repeated per hand
  if (Array.isArray(raw0) && raw0.length > 0 && Array.isArray(raw0[0])) {
    const pts: any[] = raw0 as any[];
    const hands: number[][][] = [];
    if (pts.length === NUM_HAND_LANDMARKS) {
      const hand = pts.map((p) => [p[0] || 0, p[1] || 0, p[2] || 0]);
      hands.push(hand);
      return hands;
    }
    // If multiple of 21, chunk
    if (pts.length % NUM_HAND_LANDMARKS === 0) {
      const count = Math.floor(pts.length / NUM_HAND_LANDMARKS);
      for (let h = 0; h < count; h++) {
        const start = h * NUM_HAND_LANDMARKS;
        const hand = pts
          .slice(start, start + NUM_HAND_LANDMARKS)
          .map((p) => [p[0] || 0, p[1] || 0, p[2] || 0]);
        hands.push(hand);
      }
      return hands;
    }
  }
  return [];
}

function extractLandmarksFromFrame(frame: Frame): { hands: number[][][]; confidences: number[] } {
  'worklet';
  if (!handModel) return { hands: [], confidences: [] };

  let result: any[] = [];
  let hands: number[][][] = [];
  const confidences: number[] = [];

  try {
    const plugin = getResizePlugin();
    if (plugin) {
      // Resize and normalize the image according to the model's metadata.
      const resized = plugin.resize(frame, {
        scale: { width: 192, height: 192 },
        pixelFormat: 'rgb',
        dataType: 'float32',
      });
      const input = resized.slice();

      // Unconditionally normalize to [0, 1] as specified in the model metadata.
      for (let k = 0; k < input.length; k++) {
        input[k] = input[k] / 255.0;
      }

      // Run the model.
      const modelResult = handModel.runSync([input]) as any[];
      result = Array.isArray(modelResult) ? modelResult : [];

      // The metadata told us that the landmarks are in the 3rd output tensor (index 2).
      // The presence score is in the 2nd output tensor (index 1).
      const presenceScore = result && result.length > 1 ? toFloat32(result[1]) : null;
      const landmarksRaw = result && result.length > 2 ? toFloat32(result[2]) : null;

      if (presenceScore && presenceScore[0] > 0.5 && landmarksRaw) {
        // A hand is present, and we have landmark data.
        // The landmark tensor is a flat array of 63 floats (21 * 3).
        const hand = reshapeTo2D(landmarksRaw);
        if (hand) {
          hands.push(hand);
          confidences.push(presenceScore[0]);
        }
      }
    }
  } catch (e: any) {
    logErrorJS(`Landmark extraction failed: ${e.message}`);
    return { hands: [], confidences: [] };
  }

  // Fallback for safety, though it shouldn't be reached if the logic above is correct.
  if (hands.length === 0) {
    const flat = toFloat32(result[2]); // Still check the 3rd tensor
    if (flat && flat.length >= NUM_HAND_LANDMARKS * NUM_COORDINATES) {
      const view = flat.subarray(0, NUM_HAND_LANDMARKS * NUM_COORDINATES);
      const coerced: number[][] = new Array(NUM_HAND_LANDMARKS);
      for (let i = 0; i < NUM_HAND_LANDMARKS; i++) {
        const base = i * NUM_COORDINATES;
        const x = view[base];
        const y = view[base + 1];
        const z = view[base + 2];
        coerced[i] = [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)), z];
      }
      hands = [coerced];
      if (__DEV__ && Date.now() - lastLog > 500) {
        lastLog = Date.now();
        logJS('LM fallback decode used (first 63 floats)');
      }
    }
  }

  return { hands, confidences };
}

export function useHandLandmarkExtractor(): (frame: Frame) => number[][] | null {
  const { resize } = useResizePlugin();
  return (frame: Frame): number[][] | null => {
    'worklet';
    const { hands, confidences } = extractLandmarksFromFrame(frame);
    const landmarks = hands[0] ?? null;
    if (__DEV__ && Date.now() - lastLog > 500) {
      lastLog = Date.now();
      const conf = confidences[0] ?? 0;
      logJS(`LM ok: ${landmarks?.length ?? 0} pts, conf=${conf.toFixed(2)} hands=${hands.length}`);
    }
    return landmarks;
  };
}

export function extractHandLandmarks(frame: Frame): number[][] | null {
  'worklet';
  const { hands } = extractLandmarksFromFrame(frame);
  const landmarks = hands[0] ?? null;
  if (typeof __DEV__ !== 'undefined' && __DEV__ && Date.now() - lastLog > 500) {
    lastLog = Date.now();
    logLandmarks(landmarks);
  }
  return landmarks;
}

export function useMultiHandLandmarkExtractor(): (frame: Frame) => number[][][] {
  const { resize } = useResizePlugin();
  return (frame: Frame): number[][][] => {
    'worklet';
    const { hands } = extractLandmarksFromFrame(frame);
    return hands;
  };
}

export function extractMultiHandLandmarks(frame: Frame): number[][][] {
  'worklet';
  const { hands } = extractLandmarksFromFrame(frame);
  return hands;
}

// extractHandLandmarksFlat removed; consumers should reshape/flatten as needed from 2D landmarks

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
