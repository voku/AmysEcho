/**
 * Shared Math Utilities for Gesture Processing
 * 
 * Amy First: Centralized math functions to reduce code duplication and ensure
 * consistent calculations across all gesture processing components.
 */

/**
 * Calculate Euclidean distance between two 3D points
 * Handles 2D points by treating Z as 0
 * 
 * @param p1 First point [x, y, z?]
 * @param p2 Second point [x, y, z?]
 * @returns Euclidean distance between the points
 */
export function euclideanDistance(p1: number[], p2: number[]): number {
  const dx = (p1[0] ?? 0) - (p2[0] ?? 0);
  const dy = (p1[1] ?? 0) - (p2[1] ?? 0);
  const dz = (p1[2] ?? 0) - (p2[2] ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate 3D symmetry score between two hand landmark arrays
 * Uses full 3D coordinates for accurate comparison
 * 
 * @param leftHand Left hand landmarks
 * @param rightHand Right hand landmarks  
 * @param symmetryMultiplier Multiplier for difference-to-score conversion (default: 3)
 * @returns Symmetry score between 0 (different) and 1 (identical)
 */
export function calculate3DHandSymmetry(
  leftHand: number[][],
  rightHand: number[][],
  symmetryMultiplier: number = 3
): number {
  if (leftHand.length === 0 || rightHand.length === 0) return 0;

  let totalDiff = 0;
  let count = 0;

  for (let i = 0; i < Math.min(leftHand.length, rightHand.length); i++) {
    const left = leftHand[i];
    const right = rightHand[i];

    if (!left || !right || left.length < 2 || right.length < 2) continue;

    // Mirror right hand X coordinate for comparison
    const leftX = left[0] ?? 0;
    const leftY = left[1] ?? 0;
    const leftZ = left[2] ?? 0;
    const rightX = 1 - (right[0] ?? 0); // Mirror
    const rightY = right[1] ?? 0;
    const rightZ = right[2] ?? 0;

    const diff = Math.sqrt(
      Math.pow(leftX - rightX, 2) + 
      Math.pow(leftY - rightY, 2) +
      Math.pow(leftZ - rightZ, 2)
    );
    totalDiff += diff;
    count++;
  }

  if (count === 0) return 0;

  const avgDiff = totalDiff / count;
  // Convert difference to symmetry score (0 diff = 1 symmetry)
  return Math.max(0, 1 - avgDiff * symmetryMultiplier);
}

/**
 * Normalize a vector to unit length
 * 
 * @param v Input vector
 * @returns Normalized vector (original if magnitude is 0)
 */
export function normalizeVector(v: number[]): number[] {
  const magnitude = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return v;
  return v.map(val => val / magnitude);
}

/**
 * Common hand landmark indices for MediaPipe hand model
 */
export const HAND_LANDMARK_INDICES = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const FINGERTIP_INDICES = [4, 8, 12, 16, 20];
export const MCP_INDICES = [5, 9, 13, 17];
export const NUM_HAND_LANDMARKS = 21;
