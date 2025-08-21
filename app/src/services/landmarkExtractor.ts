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

      // Try to locate presence and landmarks tensors even if indices differ across builds
      const tensors: Float32Array[] = [];
      for (let i = 0; i < result.length; i++) {
        const t = toFloat32(result[i]);
        if (t) tensors.push(t);
      }

      let presenceVal = 1.0;
      // Prefer index 1 if available; else pick a small-length tensor (<=4) as presence
      const presenceScore = result.length > 1 ? toFloat32(result[1]) : null;
      if (presenceScore && presenceScore.length >= 1) {
        presenceVal = presenceScore[0];
      } else {
        const small = tensors.find((t) => t.length >= 1 && t.length <= 4);
        if (small) presenceVal = small[0];
      }

      // Find a tensor containing 21*(3 or 4) floats per hand (allow visibility channel)
      let landmarksRaw: Float32Array | null = (result.length > 2 ? toFloat32(result[2]) : null) || null;
      const chunk3 = NUM_HAND_LANDMARKS * 3;
      const chunk4 = NUM_HAND_LANDMARKS * 4;
      if (!landmarksRaw || (landmarksRaw.length % chunk3 !== 0 && landmarksRaw.length % chunk4 !== 0)) {
        const candidate = tensors.find(
          (t) => (t.length % chunk3 === 0 || t.length % chunk4 === 0) && t.length >= chunk3,
        );
        if (candidate) landmarksRaw = candidate;
      }

      // Lower presence threshold slightly to be robust across models; we'll rely on classifier confidence later
      const PRESENCE_THRESHOLD = 0.2;
      if (presenceVal >= PRESENCE_THRESHOLD && landmarksRaw) {
        const len = landmarksRaw.length;
        let handsArr: number[][][] = [];
        if (len % chunk3 === 0) {
          handsArr = reshapeHandsFromFlat(landmarksRaw);
        } else if (len % chunk4 === 0) {
          // Convert from 4D (x,y,z,vis) to 3D (x,y,z) by skipping every 4th value
          const nHands = Math.floor(len / chunk4);
          const out = new Float32Array(nHands * chunk3);
          let oi = 0;
          for (let h = 0; h < nHands; h++) {
            const base = h * chunk4;
            for (let i = 0; i < NUM_HAND_LANDMARKS; i++) {
              const bi = base + i * 4;
              out[oi++] = landmarksRaw[bi + 0];
              out[oi++] = landmarksRaw[bi + 1];
              out[oi++] = landmarksRaw[bi + 2];
            }
          }
          handsArr = reshapeHandsFromFlat(out);
        }
        if (handsArr.length > 0) {
          hands.push(handsArr[0]);
          confidences.push(presenceVal);
        }
      }

      if (!lensLoggedOnce) {
        lensLoggedOnce = true;
        const shapes = tensors.map((t) => t.length).join(',');
        logWarnJS(`Hand model outputs lengths: [${shapes}] presence=${presenceVal.toFixed(2)} sel=${landmarksRaw?.length ?? 0}`);
      }
    }
  } catch (e: any) {
    logErrorJS(`Landmark extraction failed: ${e.message}`);
    return { hands: [], confidences: [] };
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
