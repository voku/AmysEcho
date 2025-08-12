/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Frame } from 'react-native-vision-camera';

// Plug these names into your native JSI bridge (vision-camera-resize-plugin + your hand model runner).
declare const __VISION_RESIZE__: (frame: Frame, w: number, h: number) => Uint8Array;
declare const __RUN_HAND_LANDMARKER__: (
  rgb: Uint8Array,
  w: number,
  h: number
) => Float32Array | null;

/**
 * Returns Float32Array length 63: [x0,y0,z0, x1,y1,z1, ...] (normalized 0..1),
 * or null when no hand is detected. Sync-only (worklet).
 */
export function extractHandLandmarks(frame: Frame): Float32Array | null {
  'worklet';
  const W = 224; // adjust to your model input
  const H = 224;

  // 1) YUV->RGB + resize (native)
  const rgb = __VISION_RESIZE__(frame, W, H);
  if (!rgb || rgb.length !== W * H * 3) return null;

  // 2) Landmark inference (native)
  const out = __RUN_HAND_LANDMARKER__(rgb, W, H) as Float32Array | null;
  if (!out || out.length !== 63) return null;
  return out;
}
