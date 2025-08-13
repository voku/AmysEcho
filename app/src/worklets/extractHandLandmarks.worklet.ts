/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Frame } from 'react-native-vision-camera';

// Plug these names into your native JSI bridge (vision-camera-resize-plugin + your hand model runner).
// When running without the native plugins (e.g. in development or on devices
// where they are not available) these globals will simply be undefined.  We
// therefore access them via `globalThis` at runtime so that bundling the
// worklet does not crash the app when the native side is missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResizeFn = (frame: Frame, w: number, h: number) => Uint8Array;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LandmarkFn = (rgb: Uint8Array, w: number, h: number) => Float32Array | null;

/**
 * Returns Float32Array length 63: [x0,y0,z0, x1,y1,z1, ...] (normalized 0..1),
 * or null when no hand is detected. Sync-only (worklet).
 */
export function extractHandLandmarks(frame: Frame): Float32Array | null {
  'worklet';
  const W = 224; // adjust to your model input
  const H = 224;
  try {
    // Access native functions through the global object so that the worklet can
    // safely run even when the native plugins are not installed.
    const visionResize = (globalThis as any).__VISION_RESIZE__ as ResizeFn | undefined;
    const runHandLandmarker = (globalThis as any)
      .__RUN_HAND_LANDMARKER__ as LandmarkFn | undefined;
    if (typeof visionResize !== 'function' || typeof runHandLandmarker !== 'function') {
      return null;
    }

    // 1) YUV->RGB + resize (native)
    const rgb = visionResize(frame, W, H);
    if (!rgb || rgb.length !== W * H * 3) return null;

    // 2) Landmark inference (native)
    const out = runHandLandmarker(rgb, W, H) as Float32Array | null;
    if (!out || out.length !== 63) return null;
    return out;
  } catch (_e) {
    // Fail closed in the worklet to avoid dropping frames
    return null;
  }
}
