/**
 * Landmark Normalizer - Amy First
 *
 * Utilities for normalizing hand landmarks before classification.
 * Strategy: translate to wrist; scale all axes by max(|x| + |y| + |z|)
 */

export type Point = [number, number, number];

const WRIST_INDEX = 0;
const HAND_SIZE = 21;

/**
 * Normalize landmarks for a single hand.
 * Translates to wrist origin and scales uniformly.
 */
export function normalizeLandmarks(landmarks: Point[]): Point[] {
  if (!landmarks || landmarks.length === 0) {
    return [];
  }

  const hand = landmarks.slice(0, HAND_SIZE);
  const wrist = hand[WRIST_INDEX];
  if (!wrist) {
    return [];
  }
  const [wx = 0, wy = 0, wzRaw = 0] = wrist;
  const translated = hand.map((point) => {
    const [x = 0, y = 0, z = 0] = point ?? [];
    return [
      x - wx,
      y - wy,
      (z ?? 0) - (wzRaw ?? 0),
    ] as Point;
  });

  const maxd = translated.reduce(
    (currentMax, [x, y, z]) =>
      Math.max(currentMax, Math.abs(x) + Math.abs(y) + Math.abs(z)),
    0,
  );
  const scale = maxd || 1;
  return translated.map(([x, y, z]) => [x / scale, y / scale, z / scale] as Point);
}

/**
 * Normalize landmarks to a flat Float32Array for MLP input.
 */
export function normalizeLandmarksToFlat(landmarks: Point[]): Float32Array {
  if (!landmarks || landmarks.length < HAND_SIZE) return new Float32Array(0);
  const norm = normalizeLandmarks(landmarks.slice(0, HAND_SIZE));
  const out = new Float32Array(norm.length * 3);
  let k = 0;
  for (const [x, y, z] of norm) {
    out[k++] = x;
    out[k++] = y;
    out[k++] = z;
  }
  return out;
}

/**
 * Convert raw landmarks from detection format to Point format.
 */
export function convertToPoints(landmarks: number[][]): Point[] {
  if (!landmarks || !Array.isArray(landmarks)) {
    return [];
  }
  return landmarks.map((point) => {
    if (!Array.isArray(point)) {
      return [0, 0, 0] as Point;
    }
    const x = typeof point[0] === 'number' ? point[0] : 0;
    const y = typeof point[1] === 'number' ? point[1] : 0;
    const z = typeof point[2] === 'number' ? point[2] : 0;
    return [x, y, z] as Point;
  });
}

/**
 * Get normalized landmark data ready for MLP classification.
 */
export function prepareLandmarksForMLP(rawLandmarks: number[][]): Float32Array {
  const points = convertToPoints(rawLandmarks);
  return normalizeLandmarksToFlat(points);
}

/**
 * Calculate the centroid of a hand landmark set.
 */
export function calculateCentroid(landmarks: Point[]): Point {
  if (!landmarks || landmarks.length === 0) {
    return [0, 0, 0];
  }

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;

  for (const [x, y, z] of landmarks) {
    sumX += x;
    sumY += y;
    sumZ += z;
  }

  const count = landmarks.length;
  return [sumX / count, sumY / count, sumZ / count];
}

/**
 * Calculate the bounding box of a hand landmark set.
 */
export function calculateBoundingBox(landmarks: Point[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
} {
  if (!landmarks || landmarks.length === 0) {
    return {
      minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0,
      width: 0, height: 0, depth: 0,
    };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const [x, y, z] of landmarks) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return {
    minX, maxX, minY, maxY, minZ, maxZ,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
  };
}

/**
 * Calculate distance between two points.
 */
export function distance(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Check if a finger is extended based on landmark positions.
 * Uses tip y-position relative to base knuckle.
 */
export function isFingerExtended(
  tipLandmark: Point,
  pipLandmark: Point, // Proximal interphalangeal joint
  mcpLandmark: Point  // Metacarpophalangeal joint
): boolean {
  // Finger is extended if tip is higher (lower y) than PIP
  // and PIP is higher than MCP
  return tipLandmark[1] < pipLandmark[1] && pipLandmark[1] < mcpLandmark[1];
}

/**
 * Finger landmark indices for the 21-point hand model.
 */
export const FINGER_LANDMARKS = {
  thumb: { tip: 4, ip: 3, mcp: 2, cmc: 1 },
  index: { tip: 8, dip: 7, pip: 6, mcp: 5 },
  middle: { tip: 12, dip: 11, pip: 10, mcp: 9 },
  ring: { tip: 16, dip: 15, pip: 14, mcp: 13 },
  pinky: { tip: 20, dip: 19, pip: 18, mcp: 17 },
  wrist: 0,
} as const;

/**
 * Get finger tips landmarks from full hand.
 */
export function getFingerTips(landmarks: Point[]): {
  thumb: Point | null;
  index: Point | null;
  middle: Point | null;
  ring: Point | null;
  pinky: Point | null;
} {
  return {
    thumb: landmarks[FINGER_LANDMARKS.thumb.tip] ?? null,
    index: landmarks[FINGER_LANDMARKS.index.tip] ?? null,
    middle: landmarks[FINGER_LANDMARKS.middle.tip] ?? null,
    ring: landmarks[FINGER_LANDMARKS.ring.tip] ?? null,
    pinky: landmarks[FINGER_LANDMARKS.pinky.tip] ?? null,
  };
}

/**
 * Calculate palm center from wrist and finger MCP joints.
 */
export function calculatePalmCenter(landmarks: Point[]): Point | null {
  if (!landmarks || landmarks.length < 21) {
    return null;
  }

  const wrist = landmarks[FINGER_LANDMARKS.wrist];
  const indexMcp = landmarks[FINGER_LANDMARKS.index.mcp];
  const middleMcp = landmarks[FINGER_LANDMARKS.middle.mcp];
  const ringMcp = landmarks[FINGER_LANDMARKS.ring.mcp];
  const pinkyMcp = landmarks[FINGER_LANDMARKS.pinky.mcp];

  if (!wrist || !indexMcp || !middleMcp || !ringMcp || !pinkyMcp) {
    return null;
  }

  // Average of wrist and MCP joints
  const points = [wrist, indexMcp, middleMcp, ringMcp, pinkyMcp];
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const [x, y, z] of points) {
    sumX += x;
    sumY += y;
    sumZ += z;
  }

  return [sumX / points.length, sumY / points.length, sumZ / points.length];
}
