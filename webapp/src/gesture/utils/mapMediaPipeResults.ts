// @ts-nocheck
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
}

type HandLandmarks = NonNullable<MediaPipeGestureResult['landmarks']>[number];

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
    return { hands: [], landmarks: [], handednesses: [] };
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
  };
}
