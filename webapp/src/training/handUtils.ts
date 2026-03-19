export const HAND_LANDMARKS_PER_HAND = 21;

export function flattenHands(hands: number[][][]): number[][] {
  const left = hands?.[0] || [];
  const right = hands?.[1] || [];
  const out: number[][] = [];
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    const point = left[i];
    out.push(point ? [...point] : [0, 0, 0]);
  }
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    const point = right[i];
    out.push(point ? [...point] : [0, 0, 0]);
  }
  return out;
}

export function flattenHandsWithHandedness(hands: number[][][], handedness: ReadonlyArray<string> = []): number[][] {
  let left: number[][] = [];
  let right: number[][] = [];

  if (handedness.length === 0) {
    left = hands?.[0] || [];
    right = hands?.[1] || [];
  } else {
    const leftIndex = handedness.findIndex((h) => /left/i.test(h));
    const rightIndex = handedness.findIndex((h) => /right/i.test(h));
    left = leftIndex >= 0 ? hands[leftIndex] ?? [] : [];
    right = rightIndex >= 0 ? hands[rightIndex] ?? [] : [];
  }

  const out: number[][] = [];
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    out.push([
      left[i]?.[0] ?? 0,
      left[i]?.[1] ?? 0,
      left[i]?.[2] ?? 0,
    ]);
  }
  for (let i = 0; i < HAND_LANDMARKS_PER_HAND; i++) {
    out.push([
      right[i]?.[0] ?? 0,
      right[i]?.[1] ?? 0,
      right[i]?.[2] ?? 0,
    ]);
  }
  return out;
}

export function frameHasAnyLandmarks(
  frame: { landmarks?: number[][][]; poseLandmarks?: number[][]; faceLandmarks?: number[][] },
): boolean {
  if (frame && typeof frame === 'object') {
    if (Array.isArray(frame.landmarks) && frame.landmarks.some((hand: unknown) => Array.isArray(hand) && hand.length > 0)) {
      return true;
    }

    if (Array.isArray(frame.poseLandmarks) && frame.poseLandmarks.length > 0) {
      return true;
    }

    if (Array.isArray(frame.faceLandmarks) && frame.faceLandmarks.length > 0) {
      return true;
    }
  }

  return false;
}

export function framesHaveHandLandmarks(
  frames: ReadonlyArray<{ landmarks?: number[][][] }> | undefined,
): boolean {
  if (!Array.isArray(frames)) return false;

  return frames.some(
    (frame) =>
      frame &&
      typeof frame === 'object' &&
      Array.isArray(frame.landmarks) &&
      frame.landmarks.some((hand: unknown) => Array.isArray(hand) && hand.length > 0),
  );
}

export function processFramesForUpload(
  frames: import('./types').FrameData[],
  gestureDefinitionId: string,
  profileId?: string,
): { gestureDefinitionId: string; landmarkData: number[][]; profileId?: string }[] {
  return frames
    .filter(
      (frame) =>
        Array.isArray(frame.landmarks) &&
        frame.landmarks.some((hand) => Array.isArray(hand) && hand.length > 0),
    )
    .map((frame) => ({
      gestureDefinitionId,
      landmarkData: flattenHandsWithHandedness(frame.landmarks, frame.handedness ?? []),
      ...(profileId ? { profileId } : {}),
    }));
}

/**
 * Small epsilon value to prevent division by zero in motion ratio calculations.
 */
const MOTION_RATIO_EPSILON = 0.001;

/**
 * Compute the total motion/movement for a hand across multiple frames.
 * Motion is calculated as the sum of L1 (Manhattan) distance changes between 
 * consecutive frames for all landmarks in the specified hand.
 * 
 * @param frames - Array of frame objects containing landmarks and handedness
 * @param handLabel - Which hand to measure motion for ('left' or 'right')
 * @returns Total accumulated motion value (sum of coordinate changes)
 */
function computeHandMotion(frames: ReadonlyArray<{ landmarks?: number[][][]; handedness?: ReadonlyArray<string> }>, handLabel: 'left' | 'right'): number {
  let totalMotion = 0;
  let prevPositions: number[][] | null = null;

  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length === 0) continue;

    const handedness = frame.handedness || [];
    const handIndex = handLabel === 'left'
      ? handedness.findIndex((h) => /left/i.test(h))
      : handedness.findIndex((h) => /right/i.test(h));
    
    // If handedness labels exist but this hand isn't found, skip
    if (handedness.length > 0 && handIndex < 0) {
      prevPositions = null;
      continue;
    }
    
    // Use found index or default to left=0, right=1 when no handedness labels
    const effectiveIndex = handIndex >= 0 ? handIndex : (handLabel === 'left' ? 0 : 1);
    const hand = frame.landmarks[effectiveIndex];
    
    if (!hand || hand.length === 0) {
      prevPositions = null;
      continue;
    }

    if (prevPositions && prevPositions.length === hand.length) {
      for (let i = 0; i < hand.length; i++) {
        const prev = prevPositions[i] || [0, 0, 0];
        const curr = hand[i] || [0, 0, 0];
        const x1 = prev[0] ?? 0;
        const y1 = prev[1] ?? 0;
        const z1 = prev[2] ?? 0;
        const x2 = curr[0] ?? 0;
        const y2 = curr[1] ?? 0;
        const z2 = curr[2] ?? 0;
        totalMotion += Math.abs(x2 - x1) + Math.abs(y2 - y1) + Math.abs(z2 - z1);
      }
    }
    
    prevPositions = hand.map(p => [...p]);
  }

  return totalMotion;
}

/**
 * Check if a hand has any non-zero landmarks in the given frames.
 */
function handHasLandmarks(frames: ReadonlyArray<{ landmarks?: number[][][]; handedness?: ReadonlyArray<string> }>, handLabel: 'left' | 'right'): boolean {
  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length === 0) continue;
    
    const handedness = frame.handedness || [];
    const handIndex = handLabel === 'left'
      ? handedness.findIndex((h) => /left/i.test(h))
      : handedness.findIndex((h) => /right/i.test(h));
    
    // If handedness labels exist but this hand isn't found, skip (don't use default index)
    if (handedness.length > 0 && handIndex < 0) {
      continue;
    }
    
    // Use found index or default to left=0, right=1 when no handedness labels
    const effectiveIndex = handIndex >= 0 ? handIndex : (handLabel === 'left' ? 0 : 1);
    const hand = frame.landmarks[effectiveIndex];
    
    if (hand && hand.some(p => p && (p[0] !== 0 || p[1] !== 0 || p[2] !== 0))) {
      return true;
    }
  }
  return false;
}

export type SuggestedHandFocus = {
  suggestion: import('./types').HandFocus;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  motionRatio?: number;
};

export type SimplifiedHandFocus = 'dominant_only' | 'both_hands' | 'either_hand';

export function simplifyHandFocus(handFocus: import('./types').HandFocus): SimplifiedHandFocus {
  if (handFocus === 'dominant_only') {
    return 'dominant_only';
  }
  if (handFocus === 'either_hand') {
    return 'either_hand';
  }
  return 'both_hands';
}

export function resolveHandFocus(
  selection: SimplifiedHandFocus,
  suggestion?: SuggestedHandFocus | null,
): import('./types').HandFocus {
  if (selection === 'dominant_only') {
    return 'dominant_only';
  }
  if (selection === 'either_hand') {
    return 'either_hand';
  }
  return suggestion?.suggestion === 'both_asymmetric' ? 'both_asymmetric' : 'both_equal';
}

export function handFocusSupportsMirrorAugmentation(handFocus: import('./types').HandFocus | undefined): boolean {
  if (!handFocus) {
    return false;
  }
  return handFocus === 'both_equal' || handFocus === 'either_hand';
}

/**
 * Analyze recorded frames and suggest which hand focus setting to use.
 * Based on motion analysis of left vs right hand across the recording.
 * 
 * This helps users choose the right setting by analyzing:
 * - Which hand(s) are visible
 * - How much each hand is moving
 * - The ratio of motion between hands
 */
export function suggestHandFocus(
  frames: ReadonlyArray<{ landmarks?: number[][][]; handedness?: ReadonlyArray<string> }>
): SuggestedHandFocus {
  if (!frames || frames.length < 2) {
    return {
      suggestion: 'both_equal',
      confidence: 'low',
      reason: 'Nicht genügend Frames für eine Analyse. Standardeinstellung wird empfohlen.',
    };
  }

  const leftHasData = handHasLandmarks(frames, 'left');
  const rightHasData = handHasLandmarks(frames, 'right');

  // Only one hand visible - suggest dominant_only since only one hand matters
  if (leftHasData && !rightHasData) {
    return {
      suggestion: 'dominant_only',
      confidence: 'high',
      reason: 'Nur die linke Hand wurde erkannt. Empfehle Fokus auf Haupthand.',
    };
  }
  if (rightHasData && !leftHasData) {
    return {
      suggestion: 'dominant_only',
      confidence: 'high',
      reason: 'Nur die rechte Hand wurde erkannt. Empfehle Fokus auf Haupthand.',
    };
  }

  // No hands visible
  if (!leftHasData && !rightHasData) {
    return {
      suggestion: 'both_equal',
      confidence: 'low',
      reason: 'Keine Hände erkannt. Bitte Aufnahme wiederholen.',
    };
  }

  // Both hands visible - analyze motion
  const leftMotion = computeHandMotion(frames, 'left');
  const rightMotion = computeHandMotion(frames, 'right');
  const totalMotion = leftMotion + rightMotion;
  
  if (totalMotion < 0.01) {
    return {
      suggestion: 'both_equal',
      confidence: 'low',
      reason: 'Kaum Bewegung erkannt. Beide Hände werden als gleich wichtig behandelt.',
    };
  }

  const motionRatio = rightMotion / (leftMotion + MOTION_RATIO_EPSILON);

  // Dominant right hand (much more motion in right)
  if (motionRatio > 3.0) {
    return {
      suggestion: 'dominant_only',
      confidence: 'high',
      reason: 'Die rechte Hand bewegt sich deutlich mehr. Vermutlich dominante Hand.',
      motionRatio,
    };
  }

  // Dominant left hand (much more motion in left)
  if (motionRatio < 0.33) {
    return {
      suggestion: 'dominant_only', 
      confidence: 'high',
      reason: 'Die linke Hand bewegt sich deutlich mehr. Vermutlich dominante Hand.',
      motionRatio,
    };
  }

  // Both hands with similar motion - symmetric gesture
  if (motionRatio > 0.7 && motionRatio < 1.3) {
    return {
      suggestion: 'both_equal',
      confidence: 'high',
      reason: 'Beide Hände bewegen sich ähnlich stark. Symmetrische Gebärde.',
      motionRatio,
    };
  }

  // Both hands but different amounts of motion - asymmetric
  return {
    suggestion: 'both_asymmetric',
    confidence: 'medium',
    reason: 'Beide Hände bewegen sich, aber unterschiedlich stark. Asymmetrische Gebärde.',
    motionRatio,
  };
}
