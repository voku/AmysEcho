/**
 * Amy's Echo Unified Preprocessing Library
 * 
 * Ensures EXACT consistency between training (Python) and inference (TypeScript)
 * for multimodal sign language recognition.
 * 
 * Amy First: Zero compromise in preprocessing consistency
 */

import { 
  MULTIMODAL_FEATURES_SIZE, 
  HAND_FEATURES_SIZE, 
  POSE_FEATURES_SIZE, 
  FACE_FEATURES_SIZE,
  MEDIAPIPE_HAND_LANDMARKS,
  MEDIAPIPE_POSE_LANDMARKS,
  MEDIAPIPE_FACE_LANDMARKS,
  HAND_PRIORITY_FACTOR,
  POSE_PRIORITY_FACTOR,
  FACE_PRIORITY_FACTOR
} from './landmarkNormalizer';

export interface MultimodalFeatures {
  handFeatures: Float32Array;
  poseFeatures: Float32Array;
  faceFeatures: Float32Array;
  combined: Float32Array;
}

export interface NormalizationConfig {
  handPriority: number;
  posePriority: number;
  facePriority: number;
  windowSize: number;
  inputDim: number;
}

/**
 * EXACT match to server's _normalize_frame function in train_mlp.py
 * This is the most critical function for consistency.
 */
export function normalizeFrameExact(
  landmarks: number[][],
  use_hands: boolean = true,
  use_pose: boolean = true,
  use_face: boolean = true
): Float32Array {
  const result = new Float32Array(MULTIMODAL_FEATURES_SIZE);
  
  // Handle different input formats (flat vs structured)
  let pts: number[][];
  if (landmarks.length === 0) {
    pts = Array(1629).fill(null).map(() => [0, 0, 0]);
  } else if (Array.isArray(landmarks[0])) {
    // Already in correct format
    pts = landmarks.slice(0, 1629).map(lm => lm || [0, 0, 0]);
  } else {
    // Need to reshape
    pts = Array(1629).fill(null).map(() => [0, 0, 0]);
  }
  
  // ========== 1. HAND LANDMARKS (MANDATORY) - 126 Features ==========
  if (use_hands) {
    const hand_pts = pts.slice(0, 126); // First 42 points (2 hands x 21 landmarks)
    for (let i = 0; i < 126; i++) {
      const point = hand_pts[i] || [0, 0, 0];
      // Apply same density-balanced priority as server
      result[i] = (point[0] || 0) * HAND_PRIORITY_FACTOR;
      result[i + 126] = (point[1] || 0) * HAND_PRIORITY_FACTOR;
      result[i + 252] = (point[2] || 0) * HAND_PRIORITY_FACTOR;
    }
  } else {
    // Zero out hand features
    for (let i = 0; i < 378; i++) {
      result[i] = 0;
    }
  }
  
  // ========== 2. POSE LANDMARKS (OPTIONAL) - 99 Features ==========
  if (use_pose && pts.length > 126) {
    const pose_pts = pts.slice(126, 159); // Next 33 points
    for (let i = 0; i < 99; i++) {
      const point = pose_pts[Math.floor(i / 3)] || [0, 0, 0];
      const coord = i % 3;
      result[378 + i] = point[coord] * POSE_PRIORITY_FACTOR;
    }
  } else {
    // Zero out pose features
    for (let i = 378; i < 477; i++) {
      result[i] = 0;
    }
  }
  
  // ========== 3. FACE LANDMARKS (OPTIONAL) - 1404 Features ==========
  if (use_face && pts.length > 159) {
    const face_pts = pts.slice(159, 627); // Remaining 468 points
    for (let i = 0; i < 1404; i++) {
      const point = face_pts[Math.floor(i / 3)] || [0, 0, 0];
      const coord = i % 3;
      result[477 + i] = point[coord] * FACE_PRIORITY_FACTOR;
    }
  } else {
    // Zero out face features
    for (let i = 477; i < 1881; i++) {
      result[i] = 0;
    }
  }
  
  // We only use first 1881 features to match server exactly
  return result.slice(0, MULTIMODAL_FEATURES_SIZE);
}

/**
 * Create temporal sliding windows exactly like server's create_sliding_windows
 */
export function createSlidingWindows(
  frameVectors: Float32Array[],
  windowSize: number = 30
): Float32Array[] {
  if (frameVectors.length === 0) return [];
  
  const arr = new Float32Array(frameVectors.length * frameVectors[0].length);
  for (let i = 0; i < frameVectors.length; i++) {
    arr.set(frameVectors[i], i * frameVectors[0].length);
  }
  
  const seqLen = frameVectors.length;
  const windows: Float32Array[] = [];
  
  // Edge replication for short clips (exactly like server)
  if (seqLen < windowSize) {
    const window = new Float32Array(windowSize * MULTIMODAL_FEATURES_SIZE);
    const first = frameVectors[0];
    
    // Pad with replicates of the first frame
    for (let i = 0; i < windowSize - seqLen; i++) {
      window.set(first, i * MULTIMODAL_FEATURES_SIZE);
    }
    
    // Add existing frames
    for (let i = 0; i < seqLen; i++) {
      window.set(frameVectors[i], (windowSize - seqLen + i) * MULTIMODAL_FEATURES_SIZE);
    }
    
    windows.push(window);
  } else {
    // Generate overlapping windows (stride=1)
    for (let start = 0; start <= seqLen - windowSize; start++) {
      const window = new Float32Array(windowSize * MULTIMODAL_FEATURES_SIZE);
      for (let i = 0; i < windowSize; i++) {
        window.set(frameVectors[start + i], i * MULTIMODAL_FEATURES_SIZE);
      }
      windows.push(window);
    }
  }
  
  return windows;
}

/**
 * Validate that feature vector matches expected dimensions
 */
export function validateFeatureVector(
  features: Float32Array,
  expectedSize: number = MULTIMODAL_FEATURES_SIZE
): { valid: boolean; error?: string } {
  if (!features) {
    return { valid: false, error: 'Feature vector is null or undefined' };
  }
  
  if (!(features instanceof Float32Array)) {
    return { valid: false, error: 'Feature vector must be Float32Array' };
  }
  
  if (features.length !== expectedSize) {
    return { 
      valid: false, 
      error: `Feature vector size mismatch: expected ${expectedSize}, got ${features.length}` 
    };
  }
  
  // Check for NaN or Infinity values
  for (let i = 0; i < features.length; i++) {
    const value = features[i];
    if (!Number.isFinite(value)) {
      return { 
        valid: false, 
        error: `Invalid value at index ${i}: ${value}` 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Get preprocessing configuration that matches server defaults
 */
export function getDefaultConfig(): NormalizationConfig {
  return {
    handPriority: HAND_PRIORITY_FACTOR,
    posePriority: POSE_PRIORITY_FACTOR,
    facePriority: FACE_PRIORITY_FACTOR,
    windowSize: 30,
    inputDim: MULTIMODAL_FEATURES_SIZE
  };
}

/**
 * Apply temporal padding exactly like server
 */
export function applyTemporalPadding(
  frames: Float32Array[],
  windowSize: number
): Float32Array[] {
  if (frames.length >= windowSize) {
    return frames;
  }
  
  const padded: Float32Array[] = [];
  const first = frames[0] || new Float32Array(MULTIMODAL_FEATURES_SIZE);
  
  // Pad with replicates of the first frame (edge replication)
  const paddingNeeded = windowSize - frames.length;
  for (let i = 0; i < paddingNeeded; i++) {
    padded.push(first);
  }
  
  // Add existing frames
  for (const frame of frames) {
    padded.push(frame);
  }
  
  return padded;
}

/**
 * Comprehensive feature extraction with validation
 */
export function extractMultimodalFeatures(
  hands: number[][][] | number[][],
  handednesses: string[][],
  pose?: number[][],
  face?: number[][],
  _config: NormalizationConfig = getDefaultConfig()
): MultimodalFeatures {
  // Validate inputs
  if (!hands || hands.length === 0) {
    throw new Error('Hand landmarks are required for multimodal feature extraction');
  }
  
  // Normalize with exact server preprocessing
  const allLandmarks = [
    ...(hands as number[][][]).flat() || [],
    ...(pose || []).flat() || [],
    ...(face || []).flat() || []
  ];
  
  const combined = normalizeFrameExact(
    allLandmarks,
    true, // use_hands
    !!pose, // use_pose
    !!face  // use_face
  );
  
  // Split into modalities for analysis
  const handFeatures = combined.slice(0, HAND_FEATURES_SIZE);
  const poseFeatures = combined.slice(HAND_FEATURES_SIZE, HAND_FEATURES_SIZE + POSE_FEATURES_SIZE);
  const faceFeatures = combined.slice(HAND_FEATURES_SIZE + POSE_FEATURES_SIZE);
  
  return {
    handFeatures,
    poseFeatures,
    faceFeatures,
    combined
  };
}

// Export constants for easy access
export {
  MULTIMODAL_FEATURES_SIZE,
  HAND_FEATURES_SIZE,
  POSE_FEATURES_SIZE,
  FACE_FEATURES_SIZE,
  HAND_PRIORITY_FACTOR,
  POSE_PRIORITY_FACTOR,
  FACE_PRIORITY_FACTOR,
  MEDIAPIPE_HAND_LANDMARKS,
  MEDIAPIPE_POSE_LANDMARKS,
  MEDIAPIPE_FACE_LANDMARKS
};