import { MediaPipeGestureResult } from '../types/MediaPipeTypes';

export interface NormalizedHandPrediction {
  landmarks: number[][];
  handedness: string;
  gestures: Array<{ label: string; score: number }>;
}

export interface NormalizedMediaPipeResult {
  hands: NormalizedHandPrediction[];
  landmarks: number[][][];
  handednesses: string[];
  poseLandmarks: number[][];
  faceLandmarks: number[][];
}

type HandLandmarks = NonNullable<MediaPipeGestureResult['landmarks']>[number];
type PoseLandmarks = NonNullable<MediaPipeGestureResult['poseLandmarks']>[number];
type FaceLandmarks = NonNullable<MediaPipeGestureResult['faceLandmarks']>[number];

function normalizeHandLandmarks(hand?: HandLandmarks): number[][] {
  if (!hand) {
    return [];
  }

  const normalized: number[][] = [];
  for (const point of hand) {
    if (!point) {
      normalized.push([0, 0, 0]);
      continue;
    }

    const { x = 0, y = 0, z = 0 } = point;
    normalized.push([x, y, z]);
  }

  return normalized;
}

export function mapMediaPipeResult(result?: MediaPipeGestureResult): NormalizedMediaPipeResult {
  if (!result) {
    return { hands: [], landmarks: [], handednesses: [], poseLandmarks: [], faceLandmarks: [] };
  }

  const maxHands = Math.max(
    result.landmarks?.length ?? 0,
    result.handednesses?.length ?? 0,
    result.gestures?.length ?? 0
  );

  const hands: NormalizedHandPrediction[] = [];

  for (let i = 0; i < maxHands; i += 1) {
    const landmarks = normalizeHandLandmarks(result.landmarks?.[i]);
    const handedness = result.handednesses?.[i]?.[0]?.categoryName ?? 'unknown';
    const gestures = (result.gestures?.[i] ?? []).map(gesture => ({
      label: gesture.categoryName,
      score: gesture.score,
    }));

    if (!landmarks.length && !gestures.length && handedness === 'unknown') {
      continue;
    }

    hands.push({ landmarks, handedness, gestures });
  }

  return {
    hands,
    landmarks: hands.map(hand => hand.landmarks),
    handednesses: hands.map(hand => hand.handedness),
    poseLandmarks: normalizePoseLandmarks(result.poseLandmarks?.[0]),
    faceLandmarks: normalizeFaceLandmarks(result.faceLandmarks?.[0]),
  };
}

function normalizePoseLandmarks(pose?: PoseLandmarks): number[][] {
  if (!pose) return [];
  return pose.map((point) => [point?.x ?? 0, point?.y ?? 0, point?.z ?? 0, point?.visibility ?? 0]);
}

function normalizeFaceLandmarks(face?: FaceLandmarks): number[][] {
  if (!face) return [];
  return face.map((point) => [point?.x ?? 0, point?.y ?? 0, point?.z ?? 0]);
}
