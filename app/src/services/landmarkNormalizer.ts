// Utilities for normalizing hand landmarks before classification
// Strategy: translate to wrist, scale by hand size (wrist to middle finger tip)

const WRIST_INDEX = 0;
const MIDDLE_TIP_INDEX = 12;

export function normalizeLandmarks2D(
  landmarks: number[][],
  options?: { alignRotation?: boolean },
): number[][] {
  if (!landmarks || landmarks.length < 21) return landmarks;

  const wrist = landmarks[WRIST_INDEX];
  const translated = landmarks.map((p) => [p[0] - wrist[0], p[1] - wrist[1], p[2] - wrist[2]]);

  const mt = translated[MIDDLE_TIP_INDEX];
  const handSize = Math.sqrt(mt[0] * mt[0] + mt[1] * mt[1] + mt[2] * mt[2]) || 1;
  let scaled = translated.map((p) => [p[0] / handSize, p[1] / handSize, p[2] / handSize]);

  if (options?.alignRotation) {
    // Align around Z so the wrist→middle MCP vector lies on +X axis (reduce in-plane rotation variance)
    const middleMCP = scaled[9];
    const angle = Math.atan2(middleMCP[1], middleMCP[0]);
    const cosA = Math.cos(-angle);
    const sinA = Math.sin(-angle);
    scaled = scaled.map((p) => [p[0] * cosA - p[1] * sinA, p[0] * sinA + p[1] * cosA, p[2]]);
  }

  return scaled;
}

export function normalizeLandmarksToFlat(
  landmarks: number[][],
  options?: { alignRotation?: boolean },
): Float32Array {
  const norm = normalizeLandmarks2D(landmarks, options);
  const out = new Float32Array(norm.length * 3);
  let k = 0;
  for (let i = 0; i < norm.length; i++) {
    out[k++] = norm[i][0];
    out[k++] = norm[i][1];
    out[k++] = norm[i][2];
  }
  return out;
}
