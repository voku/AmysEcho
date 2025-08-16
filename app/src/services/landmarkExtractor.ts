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

function reshapeHands(raw: Float32Array): number[][][] {
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

function extractLandmarksFromFrame(frame: Frame): { hands: number[][][]; confidences: number[] } {
  'worklet';
  if (!handModel) return { hands: [], confidences: [] };
  try {
    const input = resizePlugin
      ? resizePlugin.resize(frame, {
          scale: { width: 192, height: 192 },
          pixelFormat: 'rgb',
          dataType: 'uint8',
        })
      : new Uint8Array(frame.toArrayBuffer());
    const result = handModel.runSync([input]) as any[];
    const arr = result[0] instanceof Float32Array ? (result[0] as Float32Array) : new Float32Array(result[0]);
    const hands = reshapeHands(arr);
    const confSource = result[1];
    const confidences: number[] = [];
    if (confSource && typeof confSource === 'object' && 'length' in confSource) {
      const cArr = confSource as any;
      for (let i = 0; i < hands.length; i++) confidences.push(cArr[i] ?? 0);
    }
    return { hands, confidences };
  } catch (e: any) {
    logErrorJS(e.message);
    return { hands: [], confidences: [] };
  }
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
