import {
  FACE_FEATURES_SIZE,
  FACE_LANDMARKS,
  HAND_FEATURES_SIZE,
  HAND_LANDMARKS_PER_HAND,
  MULTIMODAL_FEATURES_SIZE,
  POSE_FEATURES_SIZE,
  POSE_LANDMARKS,
} from './featureSchema';

/**
 * Landmark Normalizer - Amy First
 *
 * Utilities for normalizing hand landmarks before classification.
 * Strategy: translate to wrist; scale all axes by max(|x| + |y| + |z|)
 */

export type Point = [number, number, number];

const WRIST_INDEX = 0;

/**
 * Normalize landmarks for a single hand.
 * Translates to wrist origin and scales uniformly.
 */
export function normalizeLandmarks(landmarks: Point[]): Point[] {
  if (!landmarks || landmarks.length === 0) {
    return [];
  }

  const hand = landmarks.slice(0, MEDIAPIPE_HAND_LANDMARKS);
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
  if (!landmarks || landmarks.length < MEDIAPIPE_HAND_LANDMARKS) return new Float32Array(0);
  const norm = normalizeLandmarks(landmarks.slice(0, MEDIAPIPE_HAND_LANDMARKS));
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

// MediaPipe Landmark Constants
export const MEDIAPIPE_HAND_LANDMARKS = HAND_LANDMARKS_PER_HAND; // Landmarks per hand
export const MEDIAPIPE_POSE_LANDMARKS = POSE_LANDMARKS; // Pose landmarks
export const MEDIAPIPE_FACE_LANDMARKS = FACE_LANDMARKS; // Face mesh landmarks

// Hand Landmark Indices
export const MEDIAPIPE_FACE_NOSE_TIP = 1;        // Nose tip landmark
export const MEDIAPIPE_FACE_LEFT_EYE = 33;       // Left eye center  
export const MEDIAPIPE_FACE_RIGHT_EYE = 263;     // Right eye center

// Feature Vector Sizes
export { HAND_FEATURES_SIZE, POSE_FEATURES_SIZE, FACE_FEATURES_SIZE, MULTIMODAL_FEATURES_SIZE };

// Density-Balanced Priority factors (Hands > Pose > Face)
// This prevents the 1404 face features from drowning out the 126 hand features.
// Keep in sync with server defaults in server/training/config_constants.py and
// server /api/v1/config/normalization fallback.
export let HAND_PRIORITY_FACTOR = 4.0;
export let POSE_PRIORITY_FACTOR = 0.2;
export let FACE_PRIORITY_FACTOR = 0.05;

/**
 * Update priority factors from external config.
 */
export function updatePriorityFactors(factors: { hands?: number; pose?: number; face?: number }): void {
  if (typeof factors.hands === 'number') HAND_PRIORITY_FACTOR = factors.hands;
  if (typeof factors.pose === 'number') POSE_PRIORITY_FACTOR = factors.pose;
  if (typeof factors.face === 'number') FACE_PRIORITY_FACTOR = factors.face;
}

/**
 * Get normalized landmark data ready for MLP classification.
 */
export function prepareLandmarksForMLP(rawLandmarks: number[][]): Float32Array {
  const points = convertToPoints(rawLandmarks);
  return normalizeLandmarksToFlat(points);
}

/**
 * Prepare multimodal data (hands + pose + face) for MLP classification.
 * Returns a feature vector matching the server's _normalize_multimodal format.
 * 
 * @param hands - Array of hand landmarks (2 hands x {MEDIAPIPE_HAND_LANDMARKS} landmarks)
 * @param pose - Optional pose landmarks ({MEDIAPIPE_POSE_LANDMARKS} landmarks with visibility)
 * @param face - Optional face landmarks ({MEDIAPIPE_FACE_LANDMARKS} landmarks)
 * @returns Float32Array with concatenated normalized features
 */
export function prepareMultimodalForMLP(
  hands: number[][],
  pose?: number[][],
  face?: number[][]
): Float32Array {
  // Normalize hands (required) - 126 features (2 hands × 21 points × 3 coords)
  const handFeatures = prepareHandsForMLP(hands);
  
  // Apply Hand Priority Factor
  for (let i = 0; i < handFeatures.length; i++) {
    handFeatures[i] = (handFeatures[i] ?? 0) * HAND_PRIORITY_FACTOR;
  }
  
  // Normalize pose if available - 99 features (33 points × 3 coords, drop visibility)
  const poseFeatures = pose && pose.length >= MEDIAPIPE_POSE_LANDMARKS 
    ? normalizePoseForMLP(pose)
    : new Float32Array(POSE_FEATURES_SIZE).fill(0);
    
  // Apply Pose Priority Factor
  for (let i = 0; i < poseFeatures.length; i++) {
    poseFeatures[i] = (poseFeatures[i] ?? 0) * POSE_PRIORITY_FACTOR;
  }
  
  // Normalize face if available - 1404 features (468 points × 3 coords)
  const faceFeatures = face && face.length >= MEDIAPIPE_FACE_LANDMARKS
    ? normalizeFaceFullForMLP(face)
    : new Float32Array(FACE_FEATURES_SIZE).fill(0);
    
  // Apply Face Priority Factor
  for (let i = 0; i < faceFeatures.length; i++) {
    faceFeatures[i] = (faceFeatures[i] ?? 0) * FACE_PRIORITY_FACTOR;
  }
  
  // Concatenate all features using constants: 126 + 99 + 1404 = 1629 total
  const result = new Float32Array(MULTIMODAL_FEATURES_SIZE);
  result.set(handFeatures, 0);
  result.set(poseFeatures, HAND_FEATURES_SIZE);
  result.set(faceFeatures, HAND_FEATURES_SIZE + POSE_FEATURES_SIZE);
  
  return result;
}

/**
 * Normalize both hands for MLP input.
 */
function prepareHandsForMLP(hands: number[][]): Float32Array {
  const result = new Float32Array(HAND_FEATURES_SIZE);
  
  // Normalize left hand (first 21 landmarks)
  if (hands.length > 0) {
    const leftHand = hands.slice(0, MEDIAPIPE_HAND_LANDMARKS);
    const leftNorm = prepareLandmarksForMLP(leftHand);
    result.set(leftNorm, 0);
  }
  
  // Normalize right hand (next 21 landmarks)
  if (hands.length > MEDIAPIPE_HAND_LANDMARKS) {
    const rightHand = hands.slice(MEDIAPIPE_HAND_LANDMARKS, MEDIAPIPE_HAND_LANDMARKS * 2);
    const rightNorm = prepareLandmarksForMLP(rightHand);
    result.set(rightNorm, HAND_FEATURES_SIZE / 2);
  }
  
  return result;
}

/**
 * Normalize pose landmarks for MLP input.
 * Normalizes to torso center and scales by shoulder width.
 */
function normalizePoseForMLP(pose: number[][]): Float32Array {
  const result = new Float32Array(POSE_FEATURES_SIZE);
  
  if (!pose || pose.length < MEDIAPIPE_POSE_LANDMARKS) {
    return result;
  }
  
   // Extract x,y,z coordinates (drop visibility)
   const poseXYZ = pose.slice(0, MEDIAPIPE_POSE_LANDMARKS).map(p => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]);
  
  // Calculate torso center from shoulders and hips
  const torsoIndices = [11, 12, 23, 24]; // left shoulder, right shoulder, left hip, right hip
  let centerX = 0, centerY = 0, centerZ = 0;
  for (const idx of torsoIndices) {
    const point = poseXYZ[idx];
    if (point) {
      centerX += point[0] ?? 0;
      centerY += point[1] ?? 0;
      centerZ += point[2] ?? 0;
    }
  }
  centerX /= 4;
  centerY /= 4;
  centerZ /= 4;
  
  // Calculate shoulder width for scaling
  const leftShoulder = poseXYZ[11];
  const rightShoulder = poseXYZ[12];
  if (!leftShoulder || !rightShoulder) {
    return result; // Can't normalize without shoulders
  }
  const leftX = leftShoulder[0] ?? 0;
  const leftY = leftShoulder[1] ?? 0;
  const leftZ = leftShoulder[2] ?? 0;
  const rightX = rightShoulder[0] ?? 0;
  const rightY = rightShoulder[1] ?? 0;
  const rightZ = rightShoulder[2] ?? 0;
  const shoulderWidth = Math.sqrt(
    Math.pow(leftX - rightX, 2) +
    Math.pow(leftY - rightY, 2) +
    Math.pow(leftZ - rightZ, 2)
  );
  const scale = shoulderWidth > 0 ? shoulderWidth : 1;
  
  // Normalize and flatten
  let k = 0;
  for (const point of poseXYZ) {
    if (point) {
      result[k++] = ((point[0] ?? 0) - centerX) / scale;
      result[k++] = ((point[1] ?? 0) - centerY) / scale;
      result[k++] = ((point[2] ?? 0) - centerZ) / scale;
    } else {
      result[k++] = 0;
      result[k++] = 0;
      result[k++] = 0;
    }
  }
  
  return result;
}

/**
 * Normalize ALL 468 face landmarks for MLP input.
 * Normalizes to nose tip, scaled by eye distance.
 */
function normalizeFaceFullForMLP(face: number[][]): Float32Array {
   const result = new Float32Array(FACE_FEATURES_SIZE);
   
   if (!face || face.length < MEDIAPIPE_FACE_LANDMARKS) {
     return result;
   }
   
   // Center on Nose Tip (landmark 1)
   const noseTipPoint = face[MEDIAPIPE_FACE_NOSE_TIP];
   const noseTip: [number, number, number] = noseTipPoint ? [noseTipPoint[0] ?? 0, noseTipPoint[1] ?? 0, noseTipPoint[2] ?? 0] : [0, 0, 0];
   
   // Calculate eye distance for scaling (left eye 33, right eye 263)
   const leftEyePoint = face[MEDIAPIPE_FACE_LEFT_EYE];
   const rightEyePoint = face[MEDIAPIPE_FACE_RIGHT_EYE];
   const leftEye: [number, number, number] = leftEyePoint ? [leftEyePoint[0] ?? 0, leftEyePoint[1] ?? 0, leftEyePoint[2] ?? 0] : [0, 0, 0];
   const rightEye: [number, number, number] = rightEyePoint ? [rightEyePoint[0] ?? 0, rightEyePoint[1] ?? 0, rightEyePoint[2] ?? 0] : [0, 0, 0];
   const eyeDist = Math.sqrt(
     Math.pow(leftEye[0] - rightEye[0], 2) +
     Math.pow(leftEye[1] - rightEye[1], 2) +
     Math.pow(leftEye[2] - rightEye[2], 2)
   );
   const scale = eyeDist > 0 ? eyeDist : 1;
   
   // Normalize all 468 points
   let k = 0;
   for (let i = 0; i < MEDIAPIPE_FACE_LANDMARKS; i++) {
     const point = face[i] ?? [0, 0, 0];
     result[k++] = ((point[0] ?? 0) - noseTip[0]) / scale;
     result[k++] = ((point[1] ?? 0) - noseTip[1]) / scale;
     result[k++] = ((point[2] ?? 0) - noseTip[2]) / scale;
   }
   
   return result;
 }



/**
 * Calculate centroid of a hand landmark set.
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
