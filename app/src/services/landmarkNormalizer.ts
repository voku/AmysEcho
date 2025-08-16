// Utilities for normalizing hand landmarks before classification
// Strategy: translate to wrist, scale by hand size (wrist to middle finger tip)

const WRIST_INDEX = 0;
const MIDDLE_TIP_INDEX = 12;

export function normalizeLandmarks2D(landmarks: number[][]): number[][] {
  if (!landmarks || landmarks.length < 21) return landmarks;

  const wrist = landmarks[WRIST_INDEX];
  const translated = landmarks.map((p) => [p[0] - wrist[0], p[1] - wrist[1], p[2] - wrist[2]]);

  const mt = translated[MIDDLE_TIP_INDEX];
  const handSize = Math.sqrt(mt[0] * mt[0] + mt[1] * mt[1] + mt[2] * mt[2]) || 1;

  return translated.map((p) => [p[0] / handSize, p[1] / handSize, p[2] / handSize]);
}

export function normalizeLandmarksToFlat(landmarks: number[][]): Float32Array {
  const norm = normalizeLandmarks2D(landmarks);
  const out = new Float32Array(norm.length * 3);
  let k = 0;
  for (let i = 0; i < norm.length; i++) {
    out[k++] = norm[i][0];
    out[k++] = norm[i][1];
    out[k++] = norm[i][2];
  }
  return out;
}

