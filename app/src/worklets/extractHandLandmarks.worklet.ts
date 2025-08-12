import type { Frame } from 'react-native-vision-camera';
import { extractHandLandmarks } from '../services/landmarkExtractor';

/**
 * Frame processor worklet that extracts 21 hand landmarks and flattens them
 * to a Float32Array of length 63 (x,y,z for each landmark) or returns null.
 *
 * Sync-only. Uses native YUV→RGB resize via JSI when available.
 */
export function extractHandLandmarksWorklet(frame: Frame): Float32Array | null {
  'worklet';
  const pts = extractHandLandmarks(frame);
  if (!pts || pts.length !== 21) return null;
  const out = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    const p = pts[i];
    out[i * 3 + 0] = p[0] ?? 0;
    out[i * 3 + 1] = p[1] ?? 0;
    out[i * 3 + 2] = p[2] ?? 0;
  }
  return out;
}

